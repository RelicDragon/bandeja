import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';

export const addToFavorites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.body;

  if (!clubId) {
    throw new ApiError(400, 'Club ID is required');
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
  });

  if (!club) {
    throw new ApiError(404, 'Club not found');
  }

  const existingFavorite = await prisma.userFavoriteClub.findUnique({
    where: {
      userId_clubId: {
        userId: req.userId!,
        clubId,
      },
    },
  });

  if (existingFavorite) {
    throw new ApiError(400, 'Padel center is already in favorites');
  }

  const favorite = await prisma.userFavoriteClub.create({
    data: {
      userId: req.userId!,
      clubId,
    },
    include: {
      club: {
        include: {
          city: {
            select: {
              id: true,
              name: true,
              country: true,
            },
          },
          courts: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              courtType: true,
              isIndoor: true,
              pricePerHour: true,
            },
          },
        },
      },
    },
  });

  res.status(201).json({
    success: true,
    data: favorite,
  });
});

export const removeFromFavorites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;

  const favorite = await prisma.userFavoriteClub.findUnique({
    where: {
      userId_clubId: {
        userId: req.userId!,
        clubId,
      },
    },
  });

  if (!favorite) {
    throw new ApiError(404, 'Padel center not found in favorites');
  }

  await prisma.userFavoriteClub.delete({
    where: {
      userId_clubId: {
        userId: req.userId!,
        clubId,
      },
    },
  });

  res.json({
    success: true,
    message: 'Padel center removed from favorites',
  });
});

export const getUserFavorites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const favorites = await prisma.userFavoriteClub.findMany({
    where: { userId: req.userId! },
    include: {
      club: {
        include: {
          city: {
            select: {
              id: true,
              name: true,
              country: true,
            },
          },
          courts: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              courtType: true,
              isIndoor: true,
              pricePerHour: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: favorites,
  });
});

export const checkIfFavorite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.params;

  const favorite = await prisma.userFavoriteClub.findUnique({
    where: {
      userId_clubId: {
        userId: req.userId!,
        clubId,
      },
    },
  });

  res.json({
    success: true,
    data: {
      isFavorite: !!favorite,
    },
  });
});
