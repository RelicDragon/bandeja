import { Response } from 'express';
import { Sport } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import {
  clampSportLevel,
  enrichProfileUser,
  loadProfileUser,
  upsertPadelSportProfileFromUser,
} from '../../services/user/userSportProfile.service';
import { CityGroupService } from '../../services/chat/cityGroup.service';
import { isE2eTestHeader } from '../../utils/e2eRequestContext';

export const e2eClearAssignedCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isE2eTestHeader(req)) {
    throw new ApiError(403, 'Forbidden');
  }
  const userId = req.userId!;
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });
  const previousCityId = currentUser?.currentCityId ?? null;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { currentCityId: null },
    select: PROFILE_SELECT_FIELDS,
  });
  if (previousCityId) {
    await CityGroupService.removeUserFromCityGroup(userId, previousCityId);
  }
  res.json({
    success: true,
    data: enrichProfileUser(user),
  });
});

export const e2eClearSports = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!isE2eTestHeader(req)) {
    throw new ApiError(403, 'Forbidden');
  }
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { sportsEnabled: [] },
    select: PROFILE_SELECT_FIELDS,
  });
  res.json({
    success: true,
    data: enrichProfileUser(user),
  });
});

export const switchCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.body as { cityId: string };
  const userId = req.userId!;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCityId: true },
  });
  const previousCityId = currentUser?.currentCityId ?? null;

  await CityGroupService.ensureCityGroupExists(cityId);
  await CityGroupService.addUserToCityGroup(userId, cityId, { mute: true, pin: true });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { currentCityId: cityId, cityIsSet: true },
    select: PROFILE_SELECT_FIELDS,
  });

  if (previousCityId && previousCityId !== cityId) {
    await CityGroupService.removeUserFromCityGroup(userId, previousCityId);
  }

  res.json({
    success: true,
    data: enrichProfileUser(user),
  });
});

export const setInitialLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { level } = req.body;

  if (typeof level !== 'number' || level < 1.0 || level > 7.0) {
    throw new ApiError(400, 'Level must be a number between 1.0 and 7.0');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      sportProfiles: {
        where: { sport: Sport.PADEL },
        select: { gamesPlayed: true },
      },
    },
  });

  if (!currentUser) {
    throw new ApiError(404, 'User not found');
  }

  const padelPlayed = currentUser.sportProfiles[0]?.gamesPlayed ?? 0;
  if (padelPlayed > 0) {
    throw new ApiError(400, 'Cannot set initial level after playing games');
  }

  const clampedLevel = clampSportLevel(level);
  await upsertPadelSportProfileFromUser(req.userId!, { level: clampedLevel });

  const user = await loadProfileUser(req.userId!);

  res.json({
    success: true,
    data: user,
  });
});
