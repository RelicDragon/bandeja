import { Response } from 'express';
import { Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { refreshClubCourtsCount } from '../utils/refreshClubCourtsCount';
import { ClubAdminService } from '../services/clubAdmin/clubAdmin.service';
import { assertCourtSportInClub, syncClubSportsFromCourt } from '../shared/clubSports';
import { normalizeWebCameraUrl } from '../utils/normalizeWebCameraUrl';

async function assertCourtMutationAllowed(req: AuthRequest, clubId: string) {
  if (req.user?.isAdmin) return;
  if (!req.userId) throw new ApiError(401, 'User not authenticated');
  await ClubAdminService.assertClubAdmin(req.userId, clubId);
}

export const getCourtsByClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const sportParam = typeof req.query.sport === 'string' ? req.query.sport : undefined;

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { sports: true },
  });
  if (!club) throw new ApiError(404, 'Club not found');

  let sportFilter: Sport | undefined;
  if (sportParam) {
    if (!Object.values(Sport).includes(sportParam as Sport)) {
      throw new ApiError(400, 'Invalid sport');
    }
    sportFilter = sportParam as Sport;
    if (club.sports.length > 0) {
      assertCourtSportInClub(club.sports, sportFilter);
    }
  }

  const courts = await prisma.court.findMany({
    where: {
      clubId,
      isActive: true,
      ...(sportFilter
        ? {
            OR: [{ sport: sportFilter }, { sport: null }],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    success: true,
    data: courts,
  });
});

export const getCourtById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const court = await prisma.court.findUnique({
    where: { id },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
    },
  });

  if (!court) {
    throw new ApiError(404, 'Court not found');
  }

  res.json({
    success: true,
    data: court,
  });
});

export const createCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { name, clubId, courtType, isIndoor, surfaceType, pricePerHour, sport, webCameraUrl } = body;
  if (typeof clubId !== 'string' || !clubId) throw new ApiError(400, 'Club ID is required');
  if (typeof name !== 'string' || !name.trim()) throw new ApiError(400, 'Name is required');

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, sports: true },
  });

  if (!club) {
    throw new ApiError(404, 'Club not found');
  }

  await assertCourtMutationAllowed(req, clubId);

  const courtSport = parseCourtSport(sport);
  await syncClubSportsFromCourt(clubId, courtSport);

  const normalizedWebCameraUrl = normalizeWebCameraUrl(webCameraUrl) ?? null;
  const isPlatformAdmin = req.user?.isAdmin === true;

  const court = await prisma.court.create({
    data: {
      name: name.trim(),
      clubId,
      courtType: typeof courtType === 'string' ? courtType : null,
      isIndoor: isIndoor === true,
      surfaceType: typeof surfaceType === 'string' ? surfaceType : null,
      pricePerHour: typeof pricePerHour === 'number' && Number.isFinite(pricePerHour) && pricePerHour >= 0 ? pricePerHour : null,
      sport: courtSport,
      webCameraUrl: normalizedWebCameraUrl,
      // Integration mapping is platform-admin only.
      ...(isPlatformAdmin && typeof body.externalCourtId === 'string' ? { externalCourtId: body.externalCourtId } : {}),
      ...(isPlatformAdmin && typeof body.integrationCourtName === 'string'
        ? { integrationCourtName: body.integrationCourtName }
        : {}),
    },
  });
  await refreshClubCourtsCount(clubId);

  res.status(201).json({
    success: true,
    data: court,
  });
});

/** Fields any club admin may write on a court. Identity/integration mapping is platform-admin only. */
const COURT_EDITABLE_FIELDS = [
  'name',
  'courtType',
  'isIndoor',
  'surfaceType',
  'pricePerHour',
  'isActive',
  'sport',
  'webCameraUrl',
] as const;
const COURT_PLATFORM_ADMIN_FIELDS = ['clubId', 'externalCourtId', 'integrationCourtName'] as const;

function parseCourtSport(raw: unknown): Sport | null {
  if (raw == null || raw === '') return null;
  if (!Object.values(Sport).includes(raw as Sport)) throw new ApiError(400, 'Invalid sport');
  return raw as Sport;
}

export const updateCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const isPlatformAdmin = req.user?.isAdmin === true;

  const existing = await prisma.court.findUnique({ where: { id }, select: { clubId: true } });
  if (!existing) throw new ApiError(404, 'Court not found');
  // Always authorise against the court's current club first.
  await assertCourtMutationAllowed(req, existing.clubId);

  const updateData: Record<string, unknown> = {};
  for (const key of COURT_EDITABLE_FIELDS) {
    if (body[key] !== undefined) updateData[key] = body[key];
  }
  for (const key of COURT_PLATFORM_ADMIN_FIELDS) {
    if (body[key] === undefined) continue;
    if (!isPlatformAdmin) {
      throw new ApiError(403, `Only platform admins can change ${key}`, true, { code: 'clubAdmin.forbidden' });
    }
    updateData[key] = body[key];
  }

  if (updateData.name !== undefined && (typeof updateData.name !== 'string' || !updateData.name.trim())) {
    throw new ApiError(400, 'Name is required');
  }
  if (updateData.isIndoor !== undefined && typeof updateData.isIndoor !== 'boolean') {
    throw new ApiError(400, 'isIndoor must be a boolean');
  }
  if (updateData.isActive !== undefined && typeof updateData.isActive !== 'boolean') {
    throw new ApiError(400, 'isActive must be a boolean');
  }
  if (
    updateData.pricePerHour !== undefined &&
    updateData.pricePerHour !== null &&
    (typeof updateData.pricePerHour !== 'number' || !Number.isFinite(updateData.pricePerHour) || updateData.pricePerHour < 0)
  ) {
    throw new ApiError(400, 'pricePerHour must be a non-negative number');
  }
  if (updateData.webCameraUrl !== undefined) {
    updateData.webCameraUrl = normalizeWebCameraUrl(updateData.webCameraUrl) ?? null;
  }

  const targetClubId = (updateData.clubId as string | undefined) ?? existing.clubId;
  if (targetClubId !== existing.clubId) {
    if (typeof targetClubId !== 'string') throw new ApiError(400, 'Invalid clubId');
    await assertCourtMutationAllowed(req, targetClubId);
    const club = await prisma.club.findUnique({ where: { id: targetClubId }, select: { id: true } });
    if (!club) throw new ApiError(404, 'Club not found');
  }

  if (updateData.sport !== undefined) {
    const courtSport = parseCourtSport(updateData.sport);
    updateData.sport = courtSport;
    await syncClubSportsFromCourt(targetClubId, courtSport);
  }

  if (Object.keys(updateData).length === 0) throw new ApiError(400, 'No valid fields to update');

  const court = await prisma.court.update({
    where: { id },
    data: updateData,
  });

  await refreshClubCourtsCount(existing.clubId);
  if (targetClubId !== existing.clubId) await refreshClubCourtsCount(targetClubId);

  res.json({
    success: true,
    data: court,
  });
});

export const deleteCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const court = await prisma.court.findUnique({ where: { id }, select: { clubId: true } });
  if (!court) throw new ApiError(404, 'Court not found');

  // Hard delete cascades games' court slots and holds; club admins deactivate instead.
  if (!req.user?.isAdmin) {
    throw new ApiError(403, 'Only platform admins can delete courts; deactivate the court instead', true, {
      code: 'clubAdmin.forbidden',
    });
  }

  await prisma.court.delete({ where: { id } });
  await refreshClubCourtsCount(court.clubId);

  res.status(204).send();
});