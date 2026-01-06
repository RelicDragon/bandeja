import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { getLevelName } from '../utils/playerLevels';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { ResultsStatus } from '@prisma/client';

const calculateRanks = (users: any[], isGames: boolean, isSocial: boolean): Map<string, number> => {
  const rankMap = new Map<string, number>();
  if (users.length === 0) return rankMap;

  let currentRank = 1;
  let i = 0;
  
  while (i < users.length) {
    const currentEntry = users[i];
    let tieGroupSize = 1;
    
    while (i + tieGroupSize < users.length) {
      const nextEntry = users[i + tieGroupSize];
      let isTie = false;
      
      if (isGames) {
        isTie = 
          currentEntry.gamesCount === nextEntry.gamesCount &&
          currentEntry.reliability === nextEntry.reliability &&
          currentEntry.level === nextEntry.level &&
          currentEntry.totalPoints === nextEntry.totalPoints;
      } else {
        const currentValue = isSocial ? currentEntry.socialLevel : currentEntry.level;
        const nextValue = isSocial ? nextEntry.socialLevel : nextEntry.level;
        isTie = 
          currentValue === nextValue &&
          currentEntry.reliability === nextEntry.reliability &&
          currentEntry.totalPoints === nextEntry.totalPoints;
      }
      
      if (isTie) {
        tieGroupSize++;
      } else {
        break;
      }
    }
    
    for (let j = 0; j < tieGroupSize; j++) {
      rankMap.set(users[i + j].id, currentRank);
    }
    
    i += tieGroupSize;
    currentRank += tieGroupSize;
  }
  
  return rankMap;
};

const getLastGameRatingChanges = async (userIds: string[], isSocial: boolean): Promise<Record<string, number | null>> => {
  const changes: Record<string, number | null> = {};
  
  if (userIds.length === 0) return changes;

  if (isSocial) {
    const socialLevelEvents = await prisma.levelChangeEvent.findMany({
      where: {
        userId: { in: userIds },
        eventType: { in: ['SOCIAL_BAR', 'SOCIAL_PARTICIPANT'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        levelBefore: true,
        levelAfter: true,
      },
    });

    const seenUserIds = new Set<string>();
    for (const event of socialLevelEvents) {
      if (!seenUserIds.has(event.userId)) {
        seenUserIds.add(event.userId);
        changes[event.userId] = event.levelAfter - event.levelBefore;
      }
    }
  } else {
    const gameOutcomes = await prisma.gameOutcome.findMany({
      where: {
        userId: { in: userIds },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        userId: true,
        levelChange: true,
      },
    });

    const seenUserIds = new Set<string>();
    for (const outcome of gameOutcomes) {
      if (!seenUserIds.has(outcome.userId)) {
        seenUserIds.add(outcome.userId);
        changes[outcome.userId] = outcome.levelChange;
      }
    }
  }

  return changes;
};

const mapToLeaderboard = (users: any[], rankMap: Map<string, number>, lastGameRatingChanges: Record<string, number | null>): any[] => {
  return users.map((u: any) => ({
    rank: rankMap.get(u.id),
    ...u,
    levelName: getLevelName(u.level),
    winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
    lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
  }));
};

export const getUserLeaderboardContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const currentUser = req.user!;
  const { type = 'level', scope = 'global', timePeriod = 'all' } = req.query;
  const isSocial = type === 'social';
  const isGames = type === 'games';
  const isCity = scope === 'city';

  if (isGames && timePeriod !== '10' && timePeriod !== '30' && timePeriod !== 'all') {
    res.status(400).json({
      success: false,
      message: 'Invalid time period. Must be 10, 30, or all',
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      level: true,
      socialLevel: true,
      currentCityId: true,
    },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  if (isCity && !user.currentCityId) {
    res.status(400).json({
      success: false,
      message: 'User does not have a city set',
    });
    return;
  }

  const where: any = { isActive: true };
  if (isCity) {
    where.currentCityId = user.currentCityId;
  }

  let allUsers: any[] = [];
  let rankMap: Map<string, number>;

  if (isGames) {
    const timePeriodDays = timePeriod === '10' ? 10 : timePeriod === '30' ? 30 : null;
    const dateFilter = timePeriodDays 
      ? { gte: new Date(Date.now() - timePeriodDays * 24 * 60 * 60 * 1000) }
      : undefined;

    const gameWhere: any = {
      resultsStatus: ResultsStatus.FINAL,
      participants: {
        some: {
          isPlaying: true,
        },
      },
    };

    if (dateFilter) {
      gameWhere.startTime = dateFilter;
    }

    if (isCity) {
      gameWhere.cityId = user.currentCityId;
    }

    const userGameCountsResult = await prisma.gameParticipant.groupBy({
      by: ['userId'],
      where: {
        game: gameWhere,
        isPlaying: true,
        user: where,
      },
      _count: {
        userId: true,
      },
    });

    const userGameCounts: Record<string, number> = {};
    for (const result of userGameCountsResult) {
      userGameCounts[result.userId] = result._count.userId;
    }

    allUsers = await prisma.user.findMany({
      where,
      select: {
        ...USER_SELECT_FIELDS,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
        socialLevel: true,
      },
    });

    const usersWithCounts = allUsers.map((u: any) => ({
      ...u,
      gamesCount: userGameCounts[u.id] || 0,
    }));

    usersWithCounts.sort((a: any, b: any) => {
      if (a.gamesCount !== b.gamesCount) {
        return b.gamesCount - a.gamesCount;
      }
      if (a.reliability !== b.reliability) {
        return b.reliability - a.reliability;
      }
      if (a.level !== b.level) {
        return b.level - a.level;
      }
      return b.totalPoints - a.totalPoints;
    });

    allUsers = usersWithCounts;
    rankMap = calculateRanks(allUsers, true, false);
  } else {
    const orderField = isSocial ? 'socialLevel' : 'level';

    allUsers = await prisma.user.findMany({
      where,
      orderBy: [
        { [orderField]: 'desc' },
        { reliability: 'desc' },
        { totalPoints: 'desc' },
      ],
      select: {
        ...USER_SELECT_FIELDS,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
        socialLevel: true,
      },
    });

    rankMap = calculateRanks(allUsers, false, isSocial);
  }

  const userIds = allUsers.map((u: any) => u.id);
  const lastGameRatingChanges = await getLastGameRatingChanges(userIds, isSocial);
  const leaderboard = mapToLeaderboard(allUsers, rankMap, lastGameRatingChanges);

  const currentUserIndex = allUsers.findIndex((u: any) => u.id === currentUser.id);
  const userRank = currentUserIndex >= 0 
    ? (rankMap.get(currentUser.id) || 0)
    : allUsers.length + 1;

  res.json({
    success: true,
    data: {
      leaderboard,
      userRank,
    },
  });
});

