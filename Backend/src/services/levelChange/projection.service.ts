import { LevelChangeEventType, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { gameForLevelProjection, levelProjectionUserSelect } from '../game/gamePrismaIncludes';
import { projectGameUsersForSportContext } from '../game/read.service';
import { projectUserForSportContext } from '../user/userSportProfile.service';

function buildLevelChangeWhere(userId: string, sport?: Sport) {
  if (!sport) {
    return { userId };
  }
  return {
    userId,
    NOT: {
      eventType: {
        in: [LevelChangeEventType.SOCIAL_BAR, LevelChangeEventType.SOCIAL_PARTICIPANT],
      },
    },
    OR: [{ sport }, { sport: null, game: { sport } }],
  };
}

export async function queryUserHistory(userId: string, sport?: Sport) {
  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: buildLevelChangeWhere(userId, sport),
    orderBy: { createdAt: 'desc' },
    include: {
      game: {
        include: gameForLevelProjection,
      },
    },
  });

  return levelChanges.map((event) => {
    const baseData = {
      id: event.id,
      levelBefore: event.levelBefore,
      levelAfter: event.levelAfter,
      levelChange: event.levelAfter - event.levelBefore,
      eventType: event.eventType,
      linkEntityType: event.linkEntityType,
      sport: event.sport,
      createdAt: event.createdAt,
      affectsRating: event.game?.affectsRating ?? undefined,
    };

    if (event.gameId && event.game) {
      return {
        ...baseData,
        gameId: event.gameId,
        game: projectGameUsersForSportContext(event.game),
      };
    }

    return baseData;
  });
}

export async function queryUserHistorySummary(
  userId: string,
  options?: { limit?: number; sport?: Sport },
) {
  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: buildLevelChangeWhere(userId, options?.sport),
    orderBy: { createdAt: 'desc' },
    take: options?.limit,
    select: {
      id: true,
      levelBefore: true,
      levelAfter: true,
      eventType: true,
      linkEntityType: true,
      gameId: true,
      sport: true,
      createdAt: true,
    },
  });

  const gameIds = [
    ...new Set(levelChanges.map((e) => e.gameId).filter((id): id is string => Boolean(id))),
  ];
  const affectsRatingByGameId = new Map<string, boolean>();
  if (gameIds.length > 0) {
    const games = await prisma.game.findMany({
      where: { id: { in: gameIds } },
      select: { id: true, affectsRating: true },
    });
    for (const g of games) {
      affectsRatingByGameId.set(g.id, g.affectsRating);
    }
  }

  return levelChanges.map((event) => ({
    id: event.id,
    levelBefore: event.levelBefore,
    levelAfter: event.levelAfter,
    levelChange: event.levelAfter - event.levelBefore,
    gameId: event.gameId || '',
    eventType: event.eventType,
    linkEntityType: event.linkEntityType,
    sport: event.sport,
    createdAt: event.createdAt,
    affectsRating: event.gameId
      ? affectsRatingByGameId.get(event.gameId)
      : undefined,
  }));
}

export async function queryGameHistory(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { sport: true, affectsRating: true },
  });
  const sport = game?.sport ?? Sport.PADEL;

  const levelChanges = await prisma.levelChangeEvent.findMany({
    where: { gameId },
    include: {
      user: {
        select: levelProjectionUserSelect,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return levelChanges.map((event) => ({
    id: event.id,
    userId: event.userId,
    levelBefore: event.levelBefore,
    levelAfter: event.levelAfter,
    levelChange: event.levelAfter - event.levelBefore,
    eventType: event.eventType,
    sport: event.sport,
    affectsRating: game?.affectsRating,
    user: projectUserForSportContext(event.user, sport),
    createdAt: event.createdAt,
  }));
}
