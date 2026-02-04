import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';

export const setFavoriteTrainer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { trainerId } = req.body;

  if (trainerId !== null && trainerId !== undefined) {
    const trainer = await prisma.user.findFirst({
      where: { id: trainerId, isTrainer: true },
    });
    if (!trainer) {
      throw new ApiError(400, 'Invalid trainer');
    }
  }

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { favoriteTrainerId: trainerId || null },
    select: { favoriteTrainerId: true },
  });

  res.json({
    success: true,
    data: { favoriteTrainerId: user.favoriteTrainerId },
  });
});
