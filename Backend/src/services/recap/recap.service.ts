import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import type { StorySegment } from '../story/story.feed.service';
import {
  MONTHLY_RECAP_PAYLOAD_VERSION,
  type MonthlyRecapCardDto,
  type MonthlyRecapDto,
  type MonthlyRecapPayload,
} from './recap.types';
import { buildMonthlyRecapPayload } from './recapPayload.builder';
import { buildRecapStorySegments } from './recapSegments';
import { loadRecapBuildInput, loadRecapOwner, type RecapOwnerRow } from './recapInputs.loader';
import { isMonthKey, oldestRetainedMonthKey } from './recapMonth';

/** How many month cards the Profile row can ask for at once (12 months are kept). */
export const RECAP_LIST_LIMIT = 12;

type MonthlyRecapRow = {
  monthKey: string;
  payload: Prisma.JsonValue;
  viewedAt: Date | null;
  sharedAt: Date | null;
  sharedSlideKeys: string[];
  createdAt: Date;
};

/**
 * Rows live for 12 months, so a reader can meet a payload written by an older
 * build. An unreadable payload is treated as "no recap" rather than a 500 —
 * the month card simply does not render.
 */
export function parseRecapPayload(value: Prisma.JsonValue): MonthlyRecapPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as unknown as MonthlyRecapPayload;
  if (candidate.version !== MONTHLY_RECAP_PAYLOAD_VERSION) return null;
  if (!isMonthKey(candidate.monthKey)) return null;
  if (!Array.isArray(candidate.slides) || candidate.slides.length === 0) return null;
  if (!Array.isArray(candidate.sports)) return null;
  if (!candidate.totals || typeof candidate.totals.games !== 'number') return null;
  return candidate;
}

function toDto(row: MonthlyRecapRow, payload: MonthlyRecapPayload): MonthlyRecapDto {
  return {
    monthKey: row.monthKey,
    payload,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    sharedAt: row.sharedAt?.toISOString() ?? null,
    sharedSlideKeys: row.sharedSlideKeys,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCard(row: MonthlyRecapRow, payload: MonthlyRecapPayload): MonthlyRecapCardDto {
  return {
    monthKey: row.monthKey,
    monthStart: payload.monthStart,
    games: payload.totals.games,
    winRatePct: payload.totals.winRatePct,
    variant: payload.variant,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    sharedAt: row.sharedAt?.toISOString() ?? null,
  };
}

const RECAP_SELECT = {
  monthKey: true,
  payload: true,
  viewedAt: true,
  sharedAt: true,
  sharedSlideKeys: true,
  createdAt: true,
} as const;

/** Newest first, capped at the retention window. */
export async function listMonthlyRecaps(userId: string): Promise<MonthlyRecapCardDto[]> {
  const rows = await prisma.monthlyRecap.findMany({
    where: { userId, monthKey: { gte: oldestRetainedMonthKey(new Date()) } },
    select: RECAP_SELECT,
    orderBy: { monthKey: 'desc' },
    take: RECAP_LIST_LIMIT,
  });
  return rows.flatMap((row) => {
    const payload = parseRecapPayload(row.payload);
    return payload ? [toCard(row, payload)] : [];
  });
}

export type MonthlyRecapDetail = {
  recap: MonthlyRecapDto;
  segments: StorySegment[];
};

export async function getMonthlyRecap(
  userId: string,
  monthKey: string,
): Promise<MonthlyRecapDetail> {
  if (!isMonthKey(monthKey)) {
    throw new ApiError(400, 'errors.recap.invalidMonthKey');
  }
  const row = await prisma.monthlyRecap.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
    select: RECAP_SELECT,
  });
  if (!row) {
    throw new ApiError(404, 'errors.recap.notFound');
  }
  const payload = parseRecapPayload(row.payload);
  if (!payload) {
    throw new ApiError(404, 'errors.recap.notFound');
  }
  return {
    recap: toDto(row, payload),
    segments: buildRecapStorySegments(payload, {
      createdAt: row.createdAt,
      viewed: row.viewedAt != null,
    }),
  };
}

/**
 * The rail bubble: the most recent recap the owner has not opened yet.
 * Once viewed it disappears from Home but stays on the profile.
 */
export async function getUnviewedMonthlyRecap(
  userId: string,
): Promise<MonthlyRecapCardDto | null> {
  const row = await prisma.monthlyRecap.findFirst({
    where: {
      userId,
      viewedAt: null,
      monthKey: { gte: oldestRetainedMonthKey(new Date()) },
    },
    select: RECAP_SELECT,
    orderBy: { monthKey: 'desc' },
  });
  if (!row) return null;
  const payload = parseRecapPayload(row.payload);
  return payload ? toCard(row, payload) : null;
}

export async function markMonthlyRecapViewed(
  userId: string,
  monthKey: string,
): Promise<{ viewedAt: string }> {
  if (!isMonthKey(monthKey)) {
    throw new ApiError(400, 'errors.recap.invalidMonthKey');
  }
  const now = new Date();
  const updated = await prisma.monthlyRecap.updateMany({
    where: { userId, monthKey, viewedAt: null },
    data: { viewedAt: now },
  });
  if (updated.count > 0) return { viewedAt: now.toISOString() };

  const existing = await prisma.monthlyRecap.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
    select: { viewedAt: true },
  });
  if (!existing) throw new ApiError(404, 'errors.recap.notFound');
  return { viewedAt: (existing.viewedAt ?? now).toISOString() };
}

export type RecapGenerationOutcome = {
  monthKey: string;
  created: boolean;
  payload: MonthlyRecapPayload;
};

/**
 * Builds and stores one user's recap for one month.
 *
 * **Idempotent by construction.** The scheduler runs on three consecutive days
 * and retries on failure, so the unique `(userId, monthKey)` is the guard: a
 * second pass takes the `P2002` branch, keeps the stored payload and reports
 * `created: false`, which is what stops a duplicate push from going out.
 */
export async function generateMonthlyRecap(
  owner: RecapOwnerRow,
  monthKey: string,
): Promise<RecapGenerationOutcome> {
  const input = await loadRecapBuildInput(owner, monthKey);
  const payload = buildMonthlyRecapPayload(input);

  try {
    await prisma.monthlyRecap.create({
      data: {
        userId: owner.id,
        monthKey,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
    return { monthKey, created: true, payload };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.monthlyRecap.findUnique({
        where: { userId_monthKey: { userId: owner.id, monthKey } },
        select: RECAP_SELECT,
      });
      const stored = existing ? parseRecapPayload(existing.payload) : null;
      return { monthKey, created: false, payload: stored ?? payload };
    }
    throw error;
  }
}

/** Convenience for the controller and tests: load the owner, then generate. */
export async function generateMonthlyRecapForUser(
  userId: string,
  monthKey: string,
): Promise<RecapGenerationOutcome | null> {
  const owner = await loadRecapOwner(userId);
  if (!owner) return null;
  return generateMonthlyRecap(owner, monthKey);
}

export async function loadRecapPayloadForShare(
  userId: string,
  monthKey: string,
): Promise<MonthlyRecapPayload> {
  if (!isMonthKey(monthKey)) {
    throw new ApiError(400, 'errors.recap.invalidMonthKey');
  }
  const row = await prisma.monthlyRecap.findUnique({
    where: { userId_monthKey: { userId, monthKey } },
    select: { payload: true },
  });
  const payload = row ? parseRecapPayload(row.payload) : null;
  if (!payload) {
    throw new ApiError(404, 'errors.recap.notFound');
  }
  return payload;
}
