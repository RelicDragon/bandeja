import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  assertBooktimeClub,
  BOOKTIME_SNAPSHOT_FRESH_MS,
  BooktimeSnapshotCourtInput,
  parseBusySlots,
  parseDateParam,
} from '../../shared/booktimeBusySnapshot';
import { resolveSnapshotCourtIds as applySnapshotCourtIds } from '../../shared/booktimeSnapshotCourtResolve';
import { assertSnapshotPutRateLimit } from './booktimeSnapshot.rateLimit';

export type BooktimeSnapshotResponse = {
  date: string;
  fetchedAt: string | null;
  courts: Array<{
    courtId: string | null;
    externalCourtId: string | null;
    externalCourtName: string | null;
    busySlots: Array<{ startTime: string; endTime: string }>;
  }>;
};

function parseFetchedAt(raw: unknown): Date {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ApiError(400, 'fetchedAt is required');
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, 'fetchedAt is invalid');
  }
  return d;
}

function parseCourtsInput(raw: unknown): BooktimeSnapshotCourtInput[] {
  if (!Array.isArray(raw)) {
    throw new ApiError(400, 'courts must be an array');
  }

  const courts: BooktimeSnapshotCourtInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      throw new ApiError(400, 'Each court entry must be an object');
    }
    const record = item as Record<string, unknown>;
    const courtId = record.courtId;
    const externalCourtId = record.externalCourtId;
    const externalCourtName = record.externalCourtName;

    if (courtId != null && typeof courtId !== 'string') {
      throw new ApiError(400, 'courtId must be a string or null');
    }
    if (typeof externalCourtId !== 'string' || !externalCourtId.trim()) {
      throw new ApiError(400, 'externalCourtId is required for each court');
    }

    courts.push({
      courtId: courtId == null ? null : courtId,
      externalCourtId: externalCourtId.trim(),
      externalCourtName:
        typeof externalCourtName === 'string' && externalCourtName.trim()
          ? externalCourtName.trim()
          : null,
      busySlots: parseBusySlots(record.busySlots),
    });
  }

  return courts;
}

async function resolveSnapshotCourtIds(
  clubId: string,
  courts: BooktimeSnapshotCourtInput[]
): Promise<BooktimeSnapshotCourtInput[]> {
  const dbCourts = await prisma.court.findMany({
    where: { clubId, isActive: true },
    select: {
      id: true,
      name: true,
      externalCourtId: true,
      integrationCourtName: true,
    },
  });

  return applySnapshotCourtIds(courts, dbCourts);
}

export async function getBooktimeSnapshot(
  clubId: string,
  date: string
): Promise<BooktimeSnapshotResponse> {
  await assertBooktimeClub(clubId);
  parseDateParam(date);

  const rows = await prisma.clubBooktimeBusySnapshot.findMany({
    where: { clubId, date },
    orderBy: [{ courtId: 'asc' }, { externalCourtId: 'asc' }],
  });

  let fetchedAt: Date | null = null;
  for (const row of rows) {
    if (!fetchedAt || row.fetchedAt > fetchedAt) {
      fetchedAt = row.fetchedAt;
    }
  }

  return {
    date,
    fetchedAt: fetchedAt?.toISOString() ?? null,
    courts: rows.map((row) => ({
      courtId: row.courtId,
      externalCourtId: row.externalCourtId,
      externalCourtName: row.externalCourtName,
      busySlots: parseBusySlots(row.busySlots),
    })),
  };
}

export async function replaceBooktimeSnapshot(
  userId: string,
  clubId: string,
  input: {
    date: string;
    fetchedAt: unknown;
    force?: boolean;
    courts: unknown;
  }
): Promise<BooktimeSnapshotResponse> {
  await assertBooktimeClub(clubId);
  parseDateParam(input.date);
  const fetchedAt = parseFetchedAt(input.fetchedAt);
  const courts = await resolveSnapshotCourtIds(clubId, parseCourtsInput(input.courts));
  const force = input.force === true;

  const existing = await prisma.clubBooktimeBusySnapshot.findMany({
    where: { clubId, date: input.date },
    select: { fetchedAt: true },
  });

  if (!force && existing.length > 0) {
    const latest = existing.reduce(
      (max, row) => (row.fetchedAt > max ? row.fetchedAt : max),
      existing[0].fetchedAt
    );
    if (Date.now() - latest.getTime() < BOOKTIME_SNAPSHOT_FRESH_MS) {
      throw new ApiError(429, 'Snapshot was refreshed recently; use force to override');
    }
  }

  assertSnapshotPutRateLimit(userId, clubId, input.date, force);

  const courtIds = courts.map((c) => c.courtId).filter((id): id is string => id != null);
  if (courtIds.length > 0) {
    const validCourts = await prisma.court.count({
      where: { clubId, id: { in: courtIds } },
    });
    if (validCourts !== new Set(courtIds).size) {
      throw new ApiError(400, 'One or more courtId values do not belong to this club');
    }
  }

  const createRows: Prisma.ClubBooktimeBusySnapshotCreateManyInput[] = courts.map((court) => ({
    clubId,
    courtId: court.courtId,
    externalCourtId: court.externalCourtId,
    externalCourtName: court.externalCourtName,
    date: input.date,
    busySlots: court.busySlots,
    fetchedAt,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.clubBooktimeBusySnapshot.deleteMany({
      where: { clubId, date: input.date },
    });
    if (createRows.length > 0) {
      await tx.clubBooktimeBusySnapshot.createMany({ data: createRows });
    }
  });

  return getBooktimeSnapshot(clubId, input.date);
}
