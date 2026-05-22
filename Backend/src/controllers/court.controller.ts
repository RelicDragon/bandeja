import { Response } from 'express';
import { Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { refreshClubCourtsCount } from '../utils/refreshClubCourtsCount';
import { ClubAdminService } from '../services/clubAdmin/clubAdmin.service';

async function assertCourtMutationAllowed(req: AuthRequest, clubId: string) {
  if (req.user?.isAdmin) return;
  if (!req.userId) throw new ApiError(401, 'User not authenticated');
  await ClubAdminService.assertClubAdmin(req.userId, clubId);
}

export const getCourtsByClub = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;
  const sportParam = typeof req.query.sport === 'string' ? req.query.sport : undefined;

  let sportFilter: Sport | undefined;
  if (sportParam) {
    if (!Object.values(Sport).includes(sportParam as Sport)) {
      throw new ApiError(400, 'Invalid sport');
    }
    sportFilter = sportParam as Sport;
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
  const { name, clubId, courtType, isIndoor, surfaceType, pricePerHour } = req.body;

  const club = await prisma.club.findUnique({
    where: { id: clubId },
  });

  if (!club) {
    throw new ApiError(404, 'Club not found');
  }

  await assertCourtMutationAllowed(req, clubId);

  const court = await prisma.court.create({
    data: {
      name,
      clubId,
      courtType,
      isIndoor,
      surfaceType,
      pricePerHour,
    },
  });
  await refreshClubCourtsCount(clubId);

  res.status(201).json({
    success: true,
    data: court,
  });
});

export const updateCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const updateData = req.body;

  const existing = await prisma.court.findUnique({ where: { id }, select: { clubId: true } });
  if (!existing) throw new ApiError(404, 'Court not found');

  const targetClubId = (updateData.clubId as string | undefined) ?? existing.clubId;
  await assertCourtMutationAllowed(req, targetClubId);

  const court = await prisma.court.update({
    where: { id },
    data: updateData,
  });

  const newClubId = (updateData.clubId as string | undefined) ?? existing.clubId;
  await refreshClubCourtsCount(existing.clubId);
  if (newClubId !== existing.clubId) await refreshClubCourtsCount(newClubId);

  res.json({
    success: true,
    data: court,
  });
});

export const deleteCourt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const court = await prisma.court.findUnique({ where: { id }, select: { clubId: true } });
  if (!court) throw new ApiError(404, 'Court not found');

  await assertCourtMutationAllowed(req, court.clubId);

  await prisma.court.delete({ where: { id } });
  await refreshClubCourtsCount(court.clubId);

  res.status(204).send();
});