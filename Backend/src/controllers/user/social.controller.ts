import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';

export const getInvitablePlayers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.query;

  const currentUser = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { currentCityId: true },
  });

  let participantIds: string[] = [];
  let cityId = currentUser?.currentCityId;

  if (!cityId) {
    throw new ApiError(400, 'User does not have a city');
  }

  if (gameId) {
    const game = await prisma.game.findUnique({
      where: { id: gameId as string },
      select: {
        id: true,
        cityId: true,
        participants: {
          select: {
            userId: true,
          },
        },
        club: {
          select: {
            cityId: true,
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }
    const gameCityId = game.club?.cityId ?? game.cityId;

    if (gameCityId !== cityId) {
      throw new ApiError(400, 'Game is not in your city');
    }

    participantIds = game.participants.map((p: { userId: string }) => p.userId);
    cityId = gameCityId || currentUser?.currentCityId;
  }

  const interactions = await prisma.userInteraction.findMany({
    where: { fromUserId: req.userId },
    select: {
      toUserId: true,
      count: true,
    },
  });

  const interactionMap = new Map(interactions.map((i: { toUserId: string; count: number }) => [i.toUserId, i.count]));

  const users = await prisma.user.findMany({
    where: {
      id: {
        notIn: [...participantIds, req.userId!],
      },
      isActive: true,
      currentCityId: cityId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      gender: true,
      isAdmin: true,
      isTrainer: true,
      telegramUsername: true,
    },
    take: 1000,
  });

  const usersWithInteractions = users.map((user: any) => ({
    ...user,
    interactionCount: interactionMap.get(user.id) || 0,
  }));

  usersWithInteractions.sort((a: any, b: any) => b.interactionCount - a.interactionCount);

  res.json({
    success: true,
    data: usersWithInteractions,
  });
});

export const trackUserInteraction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    throw new ApiError(400, 'Target user ID is required');
  }

  if (targetUserId === req.userId) {
    throw new ApiError(400, 'Cannot track interaction with yourself');
  }

  const interaction = await prisma.userInteraction.upsert({
    where: {
      fromUserId_toUserId: {
        fromUserId: req.userId!,
        toUserId: targetUserId,
      },
    },
    update: {
      count: {
        increment: 1,
      },
      lastInteractionAt: new Date(),
    },
    create: {
      fromUserId: req.userId!,
      toUserId: targetUserId,
      count: 1,
      lastInteractionAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: interaction,
  });
});

