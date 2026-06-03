import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { Sport } from '@prisma/client';
import { getUserSportActivity } from '../../services/user/userSportActivity.service';

export const getMySportActivity = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sportsEnabled: true },
  });
  const sports = (user?.sportsEnabled?.length ? user.sportsEnabled : [Sport.PADEL]) as Sport[];
  const activity = await getUserSportActivity(userId, sports);
  res.json({ success: true, data: activity });
});
