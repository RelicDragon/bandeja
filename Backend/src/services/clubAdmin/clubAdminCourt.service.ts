import { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { ClubAdminService } from './clubAdmin.service';
import { syncClubSportsFromCourt } from '../../shared/clubSports';
import { normalizeWebCameraUrl } from '../../utils/normalizeWebCameraUrl';
import { clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';
import { logClubActivity } from './clubAdminActivity.service';
import { gameBelongsToClubWhere } from './clubAdminGameScope';
import type { CourtImpact } from '@bandeja/shared/clubAdmin/contract';

type CourtRow = Prisma.CourtGetPayload<object>;

/** Legacy raw row + console v2 fields (`ClubAdminCourt`): additive only. */
export function withCourtV2Fields(court: CourtRow) {
  return {
    ...court,
    pricePerHourCents: court.pricePerHour == null ? null : Math.round(court.pricePerHour * 100),
  };
}

const COURT_ORDER = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

/**
 * Court fields a club admin may write. `clubId`, `externalCourtId` and `integrationCourtName`
 * (integration mapping) are platform-admin only and never accepted here.
 */
export interface CourtWrite {
  name?: string;
  courtType?: string | null;
  isIndoor?: boolean;
  surfaceType?: string | null;
  /** Legacy major-unit price (`Court.pricePerHour`). v2 sends `pricePerHourCents`. */
  pricePerHour?: number | null;
  isActive?: boolean;
  sport?: Sport | null;
  webCameraUrl?: string | null;
}

function optText(raw: unknown, field: string, max = 100): string | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > max) throw clubAdminValidation(field, 'must be a short string');
  return raw.trim() || null;
}

/** Validates a court body (legacy or v2 shape) into typed writes. */
export function parseCourtWrite(body: Record<string, unknown>, mode: 'create' | 'update'): CourtWrite {
  const out: CourtWrite = {};
  if (body.name !== undefined || mode === 'create') {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) {
      throw clubAdminValidation('name', 'is required');
    }
    out.name = body.name.trim();
  }
  if (body.courtType !== undefined) out.courtType = optText(body.courtType, 'courtType');
  if (body.surfaceType !== undefined) out.surfaceType = optText(body.surfaceType, 'surfaceType');
  for (const key of ['isIndoor', 'isActive'] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') throw clubAdminValidation(key, 'must be a boolean');
    out[key] = body[key] as boolean;
  }
  if (body.pricePerHourCents !== undefined) {
    const v = body.pricePerHourCents;
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100_000_00)) {
      throw clubAdminValidation('pricePerHourCents', 'must be a non-negative integer');
    }
    out.pricePerHour = v === null ? null : (v as number) / 100;
  } else if (body.pricePerHour !== undefined) {
    const v = body.pricePerHour;
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      throw clubAdminValidation('pricePerHour', 'must be a non-negative number');
    }
    out.pricePerHour = v as number | null;
  }
  if (body.sport !== undefined) {
    const raw = body.sport;
    if (raw == null || raw === '') out.sport = null;
    else if (typeof raw === 'string' && (Object.values(Sport) as string[]).includes(raw)) out.sport = raw as Sport;
    else throw clubAdminValidation('sport', 'unknown sport');
  }
  if (body.webCameraUrl !== undefined) out.webCameraUrl = normalizeWebCameraUrl(body.webCameraUrl) ?? null;
  return out;
}

export class ClubAdminCourtService {
  static async listCourts(userId: string, clubId: string) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const courts = await prisma.court.findMany({ where: { clubId }, orderBy: COURT_ORDER });
    return courts.map(withCourtV2Fields);
  }

  static async createCourt(userId: string, clubId: string, body: Record<string, unknown>) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw clubAdminNotFound('Club');
    const write = parseCourtWrite(body ?? {}, 'create');
    const courtSport = write.sport ?? null;
    await syncClubSportsFromCourt(clubId, courtSport);

    const last = await prisma.court.aggregate({ where: { clubId }, _max: { sortOrder: true } });
    const court = await prisma.court.create({
      data: {
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        name: write.name!,
        clubId,
        courtType: write.courtType ?? null,
        isIndoor: write.isIndoor ?? false,
        surfaceType: write.surfaceType ?? null,
        pricePerHour: write.pricePerHour ?? null,
        sport: courtSport,
        webCameraUrl: write.webCameraUrl ?? null,
        ...(write.isActive !== undefined ? { isActive: write.isActive } : {}),
      },
    });
    await refreshClubCourtsCount(clubId);
    await logClubActivity(clubId, userId, 'COURT_CREATED', { court: court.name });
    return withCourtV2Fields(court);
  }

  static async patchCourt(userId: string, courtId: string, body: Record<string, unknown>, clubId?: string) {
    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court || (clubId && court.clubId !== clubId)) throw clubAdminNotFound('Court');
    await ClubAdminService.assertClubAdmin(userId, court.clubId);

    const write = parseCourtWrite(body ?? {}, 'update');
    if (write.sport !== undefined) await syncClubSportsFromCourt(court.clubId, write.sport);
    const updated = await prisma.court.update({ where: { id: courtId }, data: write satisfies Prisma.CourtUpdateInput });
    await refreshClubCourtsCount(court.clubId);
    await logClubActivity(court.clubId, userId, 'COURT_UPDATED', {
      court: updated.name,
      ...(write.isActive !== undefined ? { isActive: write.isActive } : {}),
    });
    return withCourtV2Fields(updated);
  }

  /** `POST /courts/reorder` — `courtIds` must list every court of the club exactly once. */
  static async reorderCourts(userId: string, clubId: string, body: Record<string, unknown>) {
    const ids = body?.courtIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
      throw clubAdminValidation('courtIds', 'must be a list of court ids');
    }
    const courts = await prisma.court.findMany({ where: { clubId }, select: { id: true } });
    const known = new Set(courts.map((c) => c.id));
    const unique = new Set(ids as string[]);
    if (unique.size !== ids.length || unique.size !== known.size || [...unique].some((id) => !known.has(id))) {
      throw clubAdminValidation('courtIds', "must list each of the club's courts exactly once");
    }
    await prisma.$transaction(
      (ids as string[]).map((id, index) => prisma.court.update({ where: { id }, data: { sortOrder: index } }))
    );
    await logClubActivity(clubId, userId, 'COURTS_REORDERED', { count: ids.length });
    return this.listCourts(userId, clubId);
  }

  /** What deactivating a court would affect: future live games and holds on it. */
  static async getCourtImpact(clubId: string, courtId: string, now: Date = new Date()): Promise<CourtImpact> {
    const court = await prisma.court.findFirst({ where: { id: courtId, clubId }, select: { id: true } });
    if (!court) throw clubAdminNotFound('Court');
    const gameWhere: Prisma.GameWhereInput = {
      AND: [
        gameBelongsToClubWhere(clubId),
        { timeIsSet: true, status: { in: ['ANNOUNCED', 'STARTED'] }, endTime: { gt: now } },
        { OR: [{ courtId }, { gameCourts: { some: { courtId } } }] },
      ],
    };
    const holdWhere: Prisma.CourtSlotHoldWhereInput = { clubId, courtId, deletedAt: null, endTime: { gt: now } };
    const [futureGames, futureHolds, nextGame, nextHold] = await Promise.all([
      prisma.game.count({ where: gameWhere }),
      prisma.courtSlotHold.count({ where: holdWhere }),
      prisma.game.findFirst({ where: gameWhere, orderBy: { startTime: 'asc' }, select: { startTime: true } }),
      prisma.courtSlotHold.findFirst({ where: holdWhere, orderBy: { startTime: 'asc' }, select: { startTime: true } }),
    ]);
    const next = [nextGame?.startTime, nextHold?.startTime].filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0];
    return { futureGames, futureHolds, nextBookingAt: next ? next.toISOString() : null };
  }

  static async deactivateCourt(userId: string, courtId: string) {
    return this.patchCourt(userId, courtId, { isActive: false });
  }
}
