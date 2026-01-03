import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { getLevelName } from '../utils/playerLevels';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { ResultsStatus } from '@prisma/client';

export const getLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '50', cityId } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where = cityId ? { currentCityId: cityId as string, isActive: true } : { isActive: true };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [
        { totalPoints: 'desc' },
        { level: 'desc' },
      ],
      skip,
      take: limitNum,
      select: {
        ...USER_SELECT_FIELDS,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const leaderboard = users.map((user: any, index: number) => ({
    rank: skip + index + 1,
    ...user,
    levelName: getLevelName(user.level),
    winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
  }));

  res.json({
    success: true,
    data: {
      leaderboard,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getLevelLeaderboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page = '1', limit = '50', cityId } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where = cityId ? { currentCityId: cityId as string, isActive: true } : { isActive: true };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [
        { level: 'desc' },
        { reliability: 'desc' },
      ],
      skip,
      take: limitNum,
      select: {
        ...USER_SELECT_FIELDS,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const leaderboard = users.map((user: any, index: number) => ({
    rank: skip + index + 1,
    ...user,
    levelName: getLevelName(user.level),
    winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
  }));

  res.json({
    success: true,
    data: {
      leaderboard,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getUserRanking = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      socialLevel: true,
      gender: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
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

  const [globalRank, cityRank] = await Promise.all([
    prisma.user.count({
      where: {
        isActive: true,
        totalPoints: { gt: user.totalPoints },
      },
    }),
    user.currentCityId
      ? prisma.user.count({
          where: {
            isActive: true,
            currentCityId: user.currentCityId,
            totalPoints: { gt: user.totalPoints },
          },
        })
      : null,
  ]);

  res.json({
    success: true,
    data: {
      ...user,
      levelName: getLevelName(user.level),
      winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
      globalRank: globalRank + 1,
      cityRank: cityRank !== null ? cityRank + 1 : null,
    },
  });
});

export const getUserStats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      level: true,
      gender: true,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
    },
  });

  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const recentGames = await prisma.gameOutcome.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      game: {
        select: {
          id: true,
          gameType: true,
          startTime: true,
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      user: {
        ...user,
        levelName: getLevelName(user.level),
        winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(2) : '0.00',
      },
      recentGames,
    },
  });
});

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


  if (isGames) {
    const where: any = { isActive: true };
    if (isCity) {
      where.currentCityId = user.currentCityId;
    }

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
        user: {
          isActive: true,
          ...(isCity ? { currentCityId: user.currentCityId } : {}),
        },
      },
      _count: {
        userId: true,
      },
    });

    const userGameCounts: Record<string, number> = {};
    for (const result of userGameCountsResult) {
      userGameCounts[result.userId] = result._count.userId;
    }

    const allUserIds = Object.keys(userGameCounts);
    if (!allUserIds.includes(currentUser.id)) {
      allUserIds.push(currentUser.id);
    }

    const allUsers = await prisma.user.findMany({
      where: {
        id: { in: allUserIds },
        ...where,
      },
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

    const rankMap = new Map<string, number>();
    let currentRank = 1;
    let i = 0;
    while (i < usersWithCounts.length) {
      const currentEntry = usersWithCounts[i];
      let tieGroupSize = 1;
      
      while (i + tieGroupSize < usersWithCounts.length) {
        const nextUser = usersWithCounts[i + tieGroupSize];
        if (
          currentEntry.gamesCount === nextUser.gamesCount &&
          currentEntry.reliability === nextUser.reliability &&
          currentEntry.level === nextUser.level &&
          currentEntry.totalPoints === nextUser.totalPoints
        ) {
          tieGroupSize++;
        } else {
          break;
        }
      }
      
      for (let j = 0; j < tieGroupSize; j++) {
        rankMap.set(usersWithCounts[i + j].id, currentRank);
      }
      
      i += tieGroupSize;
      currentRank += tieGroupSize;
    }

    const currentUserIndex = usersWithCounts.findIndex((u: any) => u.id === currentUser.id);
    const userRank = currentUserIndex >= 0 
      ? (rankMap.get(currentUser.id) || currentRank)
      : usersWithCounts.length + 1;

    const usersAbove = currentUserIndex > 0 
      ? usersWithCounts.slice(Math.max(0, currentUserIndex - 40), currentUserIndex) 
      : [];
    const usersBelow = currentUserIndex >= 0 && currentUserIndex < usersWithCounts.length - 1
      ? usersWithCounts.slice(currentUserIndex + 1, Math.min(usersWithCounts.length, currentUserIndex + 41))
      : [];

    const relevantUserIds = new Set<string>();
    usersAbove.forEach((u: any) => relevantUserIds.add(u.id));
    if (currentUserIndex >= 0) {
      relevantUserIds.add(currentUser.id);
    }
    usersBelow.forEach((u: any) => relevantUserIds.add(u.id));

    const relevantUsers = usersWithCounts.filter((u: any) => relevantUserIds.has(u.id));

    const allRelevantUserIds = Array.from(relevantUserIds);
    const lastGameRatingChanges: Record<string, number | null> = {};

    if (allRelevantUserIds.length > 0) {
      const gameOutcomes = await prisma.gameOutcome.findMany({
        where: {
          userId: { in: allRelevantUserIds },
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
          lastGameRatingChanges[outcome.userId] = outcome.levelChange;
        }
      }
    }

    const leaderboard = relevantUsers.map((u: any) => ({
      rank: rankMap.get(u.id) || userRank,
      ...u,
      levelName: getLevelName(u.level),
      winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        userRank,
      },
    });
    return;
  }

  const where: any = { isActive: true };
  if (isCity) {
    where.currentCityId = user.currentCityId;
  }

  const userValue = isSocial ? user.socialLevel : user.level;
  const orderField = isSocial ? 'socialLevel' : 'level';

  const rankAbove = await prisma.user.count({
    where: {
      ...where,
      [orderField]: { gt: userValue },
    },
  });

  const userRank = rankAbove + 1;

  const usersAbove = await prisma.user.findMany({
    where: {
      ...where,
      [orderField]: { gt: userValue },
    },
    orderBy: [
      { [orderField]: 'desc' },
      { reliability: 'desc' },
      { totalPoints: 'desc' },
    ],
    take: 40,
    select: {
      ...USER_SELECT_FIELDS,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
      socialLevel: true,
    },
  });

  const usersBelow = await prisma.user.findMany({
    where: {
      ...where,
      [orderField]: { lt: userValue },
    },
    orderBy: [
      { [orderField]: 'desc' },
      { reliability: 'desc' },
      { totalPoints: 'desc' },
    ],
    take: 40,
    select: {
      ...USER_SELECT_FIELDS,
      reliability: true,
      totalPoints: true,
      gamesPlayed: true,
      gamesWon: true,
      socialLevel: true,
    },
  });

  const usersSame = await prisma.user.findMany({
    where: {
      ...where,
      [orderField]: userValue,
    },
    orderBy: [
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

  const currentUserFull = usersSame.find((u: any) => u.id === currentUser.id);
  if (!currentUserFull) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  const currentUserIndex = usersSame.findIndex((u: any) => u.id === currentUser.id);
  const usersSameAbove = currentUserIndex > 0 ? usersSame.slice(0, currentUserIndex) : [];
  const usersSameBelow = currentUserIndex >= 0 && currentUserIndex < usersSame.length - 1
    ? usersSame.slice(currentUserIndex + 1)
    : [];

  const allUserIds = [
    ...usersAbove.map((u: any) => u.id),
    ...usersSameAbove.map((u: any) => u.id),
    currentUserFull.id,
    ...usersSameBelow.map((u: any) => u.id),
    ...usersBelow.map((u: any) => u.id),
  ];

  let lastGameRatingChanges: Record<string, number | null> = {};

  if (isSocial) {
    const socialLevelEvents = await prisma.levelChangeEvent.findMany({
      where: {
        userId: { in: allUserIds },
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
        lastGameRatingChanges[event.userId] = event.levelAfter - event.levelBefore;
      }
    }
  } else {
    const gameOutcomes = await prisma.gameOutcome.findMany({
      where: {
        userId: { in: allUserIds },
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
        lastGameRatingChanges[outcome.userId] = outcome.levelChange;
      }
    }
  }

  const buildRankMap = (users: any[], startRank: number) => {
    const rankMap = new Map<string, number>();
    if (users.length === 0) return rankMap;
    
    let currentRank = startRank;
    let i = 0;
    while (i < users.length) {
      const currentEntry = users[i];
      const currentValue = isSocial ? currentEntry.socialLevel : currentEntry.level;
      let tieGroupSize = 1;
      
      while (i + tieGroupSize < users.length) {
        const nextEntry = users[i + tieGroupSize];
        const nextValue = isSocial ? nextEntry.socialLevel : nextEntry.level;
        if (
          nextValue === currentValue &&
          nextEntry.reliability === currentEntry.reliability &&
          nextEntry.totalPoints === currentEntry.totalPoints
        ) {
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

  const usersAboveRankMap = buildRankMap(usersAbove, rankAbove - usersAbove.length + 1);
  const usersBelowRankMap = buildRankMap(usersBelow, userRank + usersSameBelow.length + 1);

  const leaderboard = [
    ...usersAbove.map((u: any) => ({
      rank: usersAboveRankMap.get(u.id) || (rankAbove - usersAbove.length + 1),
      ...u,
      levelName: getLevelName(u.level),
      winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
    })),
    ...usersSameAbove.map((u: any) => ({
      rank: userRank,
      ...u,
      levelName: getLevelName(u.level),
      winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
    })),
    {
      rank: userRank,
      ...currentUserFull,
      levelName: getLevelName(currentUserFull.level),
      winRate: currentUserFull.gamesPlayed > 0 ? ((currentUserFull.gamesWon / currentUserFull.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[currentUserFull.id] ?? null,
    },
    ...usersSameBelow.map((u: any) => ({
      rank: userRank,
      ...u,
      levelName: getLevelName(u.level),
      winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
    })),
    ...usersBelow.map((u: any) => ({
      rank: usersBelowRankMap.get(u.id) || (userRank + usersSameBelow.length + 1),
      ...u,
      levelName: getLevelName(u.level),
      winRate: u.gamesPlayed > 0 ? ((u.gamesWon / u.gamesPlayed) * 100).toFixed(2) : '0.00',
      lastGameRatingChange: lastGameRatingChanges[u.id] ?? null,
    })),
  ];

  res.json({
    success: true,
    data: {
      leaderboard,
      userRank,
    },
  });
});

