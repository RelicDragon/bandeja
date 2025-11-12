import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { PROFILE_SELECT_FIELDS } from '../utils/constants';

export const switchCity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cityId } = req.body;

  const city = await prisma.city.findUnique({
    where: { id: cityId },
  });

  if (!city) {
    throw new ApiError(404, 'City not found');
  }

  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { currentCityId: cityId },
    select: PROFILE_SELECT_FIELDS,
  });

  res.json({
    success: true,
    data: user,
  });
});

export const setInitialLevel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { level } = req.body;

  if (typeof level !== 'number' || level < 0 || level > 7) {
    throw new ApiError(400, 'Level must be a number between 0 and 7');
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
    data: { level },
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

