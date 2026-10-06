import { Prisma, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { refreshClubCourtsCount } from '../../utils/refreshClubCourtsCount';
import { ClubAdminService } from './clubAdmin.service';
import { syncClubSportsFromCourt } from '../../shared/clubSports';
import { normalizeWebCameraUrl } from '../../utils/normalizeWebCameraUrl';
import { clubAdminNotFound, clubAdminValidation } from './clubAdminErrors';

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
    return prisma.court.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
  }

  static async createCourt(userId: string, clubId: string, body: Record<string, unknown>) {
    await ClubAdminService.assertClubAdmin(userId, clubId);
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true } });
    if (!club) throw clubAdminNotFound('Club');
    const write = parseCourtWrite(body ?? {}, 'create');
    const courtSport = write.sport ?? null;
    await syncClubSportsFromCourt(clubId, courtSport);

    const court = await prisma.court.create({
      data: {
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
    return court;
  }

  static async patchCourt(userId: string, courtId: string, body: Record<string, unknown>, clubId?: string) {
    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court || (clubId && court.clubId !== clubId)) throw clubAdminNotFound('Court');
    await ClubAdminService.assertClubAdmin(userId, court.clubId);

    const write = parseCourtWrite(body ?? {}, 'update');
    if (write.sport !== undefined) await syncClubSportsFromCourt(court.clubId, write.sport);
    const updated = await prisma.court.update({ where: { id: courtId }, data: write satisfies Prisma.CourtUpdateInput });
    await refreshClubCourtsCount(court.clubId);
    return updated;
  }

  static async deactivateCourt(userId: string, courtId: string) {
    return this.patchCourt(userId, courtId, { isActive: false });
  }
}
