import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { BasicUser } from '../../types/user.types';

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

  const coplayRows = await prisma.$queryRaw<Array<{ userId: string; count: number }>>(
    Prisma.sql`
      SELECT gp2."userId" AS "userId", COUNT(DISTINCT g.id)::int AS count
      FROM "GameParticipant" gp1
      INNER JOIN "GameParticipant" gp2 ON gp1."gameId" = gp2."gameId"
      INNER JOIN "Game" g ON g.id = gp1."gameId"
      WHERE gp1."userId" = ${req.userId}
        AND gp1.status = 'PLAYING'::"ParticipantStatus"
        AND gp2.status = 'PLAYING'::"ParticipantStatus"
        AND gp2."userId" <> gp1."userId"
        AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
        AND g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType")
      GROUP BY gp2."userId"
    `
  );

  const gamesTogetherMap = new Map(coplayRows.map((r) => [r.userId, r.count]));

  const users = await prisma.user.findMany({
    where: {
      id: {
        notIn: [...participantIds, req.userId!],
      },
      isActive: true,
      currentCityId: cityId,
    },
    select: USER_SELECT_FIELDS,
    take: 1000,
  });

  const usersWithInteractions = users.map((user: BasicUser) => ({
    ...user,
    interactionCount: interactionMap.get(user.id) || 0,
    gamesTogetherCount: gamesTogetherMap.get(user.id) || 0,
  }));

  usersWithInteractions.sort((a, b) => b.interactionCount - a.interactionCount);

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

