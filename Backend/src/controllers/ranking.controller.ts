import { Response } from 'express';
import { Sport } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/database';
import { getLevelName } from '../utils/playerLevels';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../utils/constants';
import { ResultsStatus } from '@prisma/client';
import { calculateRanks } from '../services/ranking.service';
import {
  resolveLeaderboardSportMode,
  resolveUserSportSnapshot,
} from '../services/user/userSportProfile.service';

const getLastGameRatingChanges = async (
  userIds: string[],
  isSocial: boolean,
  sport?: Sport,
): Promise<Record<string, number | null>> => {
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
        ...(sport ? { game: { sport } } : {}),
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

const applySportRankingSnapshot = (users: any[], sport: Sport): any[] =>
  users.map((u) => {
    const snapshot = resolveUserSportSnapshot(u, sport);
    return {
      ...u,
      level: snapshot.level,
      reliability: snapshot.reliability,
      gamesPlayed: snapshot.gamesPlayed,
      gamesWon: snapshot.gamesWon,
    };
  });

/** sport=all: rank each user by their primary sport profile (fallback PADEL), not global User.level. */
const applyPrimarySportRankingSnapshot = (users: any[]): any[] =>
  users.map((u) => {
    const sport = (u.primarySport as Sport) ?? Sport.PADEL;
    return applySportRankingSnapshot([u], sport)[0];
  });

const applySocialSportSnapshot = (
  users: any[],
  sportMode: ReturnType<typeof resolveLeaderboardSportMode>,
): any[] =>
  users.map((u) => {
    const sport =
      sportMode.mode === 'sport' ? sportMode.sport : ((u.primarySport as Sport) ?? Sport.PADEL);
    const snapshot = resolveUserSportSnapshot(u, sport);
    return {
      ...u,
      reliability: snapshot.reliability,
      gamesPlayed: snapshot.gamesPlayed,
    };
  });

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
  const { type = 'level', scope = 'global', timePeriod = 'all', sport: sportQuery } = req.query;
  const isSocial = type === 'social';
  const isGames = type === 'games';
  const isCity = scope === 'city';
  const usePerSportLevel = type === 'level' && !isSocial;

  if (isGames && timePeriod !== '10' && timePeriod !== '30' && timePeriod !== 'all') {
    throw new ApiError(400, 'Invalid time period. Must be 10, 30, or all');
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true,
      level: true,
      socialLevel: true,
      currentCityId: true,
      primarySport: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (isCity && !user.currentCityId) {
    throw new ApiError(400, 'User does not have a city set');
  }

  const leaderboardSportMode = resolveLeaderboardSportMode(sportQuery, user.primarySport);
  const rankingSport =
    leaderboardSportMode.mode === 'sport' ? leaderboardSportMode.sport : null;
  const gamesSport: Sport = rankingSport ?? (user.primarySport ?? Sport.PADEL);

  const baseWhere: any = { isActive: true };
  if (isCity) {
    baseWhere.currentCityId = user.currentCityId;
  }

  const userSelect = {
    ...USER_SELECT_FIELDS,
    reliability: true,
    totalPoints: true,
    gamesPlayed: true,
    gamesWon: true,
    socialLevel: true,
    primarySport: true,
    sportProfiles: {
      select: USER_SPORT_PROFILE_SELECT,
    },
  };

  let allUsers: any[] = [];
  let rankMap: Map<string, number>;

  if (isGames) {
    const timePeriodDays = timePeriod === '10' ? 10 : timePeriod === '30' ? 30 : null;
    const dateFilter = timePeriodDays 
      ? { gte: new Date(Date.now() - timePeriodDays * 24 * 60 * 60 * 1000) }
      : undefined;

    const gameWhere: any = {
      sport: gamesSport,
      resultsStatus: ResultsStatus.FINAL,
      participants: {
        some: {
          status: 'PLAYING',
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
        status: 'PLAYING',
        user: baseWhere,
      },
      _count: {
        userId: true,
      },
    });

    const userGameCounts: Record<string, number> = {};
    for (const result of userGameCountsResult) {
      userGameCounts[result.userId] = result._count.userId;
    }

    const userIdsWithGamesInPeriod = Object.entries(userGameCounts)
      .filter(([, count]) => count > 0)
      .map(([id]) => id);

    if (userIdsWithGamesInPeriod.length === 0) {
      allUsers = [];
      rankMap = new Map();
    } else {
      allUsers = await prisma.user.findMany({
        where: { ...baseWhere, id: { in: userIdsWithGamesInPeriod } },
        select: userSelect,
      });

      const usersWithCounts = applySportRankingSnapshot(allUsers, gamesSport).map((u: any) => ({
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
        if (a.gamesWon !== b.gamesWon) {
          return b.gamesWon - a.gamesWon;
        }
        return a.id.localeCompare(b.id);
      });

      allUsers = usersWithCounts;
      rankMap = calculateRanks(allUsers, true, false, 'gamesWon');
    }
  } else if (usePerSportLevel && leaderboardSportMode.mode === 'all') {
    const usersRaw = await prisma.user.findMany({
      where: baseWhere,
      select: userSelect,
    });

    allUsers = applyPrimarySportRankingSnapshot(usersRaw)
      .filter((u) => u.gamesPlayed > 0)
      .sort((a, b) => {
        if (a.level !== b.level) return b.level - a.level;
        if (a.reliability !== b.reliability) return b.reliability - a.reliability;
        if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
        return a.id.localeCompare(b.id);
      });

    rankMap = calculateRanks(allUsers, false, false, 'gamesWon');
  } else if (usePerSportLevel && rankingSport) {
    const usersRaw = await prisma.user.findMany({
      where: baseWhere,
      select: {
        ...USER_SELECT_FIELDS,
        reliability: true,
        totalPoints: true,
        gamesPlayed: true,
        gamesWon: true,
        socialLevel: true,
        sportProfiles: {
          select: USER_SPORT_PROFILE_SELECT,
        },
      },
    });

    allUsers = usersRaw
      .map((u) => {
        const snap = resolveUserSportSnapshot(u, rankingSport);
        return {
          ...u,
          level: snap.level,
          reliability: snap.reliability,
          gamesPlayed: snap.gamesPlayed,
          gamesWon: snap.gamesWon,
        };
      })
      .filter((u) => u.gamesPlayed > 0)
      .sort((a, b) => {
        if (a.level !== b.level) return b.level - a.level;
        if (a.reliability !== b.reliability) return b.reliability - a.reliability;
        if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
        return a.id.localeCompare(b.id);
      });

    rankMap = calculateRanks(allUsers, false, false, 'gamesWon');
  } else if (isSocial) {
    const usersRaw = await prisma.user.findMany({
      where: baseWhere,
      select: userSelect,
    });

    allUsers = applySocialSportSnapshot(usersRaw, leaderboardSportMode)
      .filter((u) => u.gamesPlayed > 0)
      .sort((a, b) => {
        if (a.socialLevel !== b.socialLevel) return b.socialLevel - a.socialLevel;
        if (a.reliability !== b.reliability) return b.reliability - a.reliability;
        if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
        return a.id.localeCompare(b.id);
      });

    rankMap = calculateRanks(allUsers, false, true);
  } else {
    throw new ApiError(400, 'Invalid leaderboard type');
  }

  const ratingChangeSport = isSocial ? undefined : (rankingSport ?? gamesSport);
  const userIds = allUsers.map((u: any) => u.id);
  const lastGameRatingChanges = await getLastGameRatingChanges(
    userIds,
    isSocial,
    ratingChangeSport,
  );
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

