import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { PROFILE_SELECT_FIELDS } from '../../utils/constants';
import { completeWelcomeScreen, resetWelcomeScreen, skipWelcomeScreen } from '../../services/welcomeScreen.service';
import { CityGroupService } from '../../services/chat/cityGroup.service';

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
    data: user,
  });
});

export const setInitialLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { level } = req.body;

  if (typeof level !== 'number' || level < 1.0 || level > 7.0) {
    throw new ApiError(400, 'Level must be a number between 1.0 and 7.0');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { gamesPlayed: true },
  });

  if (!currentUser) {
    throw new ApiError(404, 'User not found');
  }

  if (currentUser.gamesPlayed > 0) {
    throw new ApiError(400, 'Cannot set initial level after playing games');
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { level: Math.max(1.0, Math.min(7.0, level)) },
      select: {
      id: true,
      level: true,
      socialLevel: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  res.json({
    success: true,
    data: user,
  });
});

export const completeWelcome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { answers } = req.body;
  const user = await completeWelcomeScreen(req.userId!, answers);
  res.json({
    success: true,
    data: user,
  });
});

export const resetWelcome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await resetWelcomeScreen(req.userId!);
  res.json({
    success: true,
    data: user,
  });
});

export const skipWelcome = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await skipWelcomeScreen(req.userId!);
  res.json({
    success: true,
    data: user,
  });
});
