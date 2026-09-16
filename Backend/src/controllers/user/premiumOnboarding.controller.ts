import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';

export const getPremiumOnboarding = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { isPremium: true, premiumOnboardingCompletedAt: true },
  });
  if (!user) throw new ApiError(404, 'User not found');
  res.json({ success: true, data: user });
});

export const completePremiumOnboarding = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Apply Premium on first completion only; replays preserve later theme choices.
  await prisma.user.updateMany({
    where: { id: req.userId!, isPremium: true, premiumOnboardingCompletedAt: null },
    data: { premiumOnboardingCompletedAt: new Date(), mainTheme: 'premium' },
  });
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { isPremium: true, premiumOnboardingCompletedAt: true, mainTheme: true },
  });
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.isPremium) throw new ApiError(403, 'Premium membership required');
  res.json({ success: true, data: user });
});
