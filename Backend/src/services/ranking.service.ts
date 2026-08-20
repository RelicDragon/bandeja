import prisma from '../config/database';
import { Sport, ResultsStatus } from '@prisma/client';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../utils/constants';
import { resolveUserSportSnapshot } from './user/userSportProfile.service';
import {
  orderPlayedRatingLeaderboard,
  orderRatingLeaderboard,
  qualifiesForRatingRank,
  ratingLeaderboardActivitySince,
} from './ranking/ratingLeaderboardQualify';

export type LeaderboardTieBreak = 'totalPoints' | 'gamesWon';

function tieBreakValue(entry: any, tieBreak: LeaderboardTieBreak): number {
  return tieBreak === 'gamesWon' ? entry.gamesWon : entry.totalPoints;
}

export const calculateRanks = (
  users: any[],
  isGames: boolean,
  isSocial: boolean,
  tieBreak: LeaderboardTieBreak = 'totalPoints',
): Map<string, number> => {
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
          tieBreakValue(currentEntry, tieBreak) === tieBreakValue(nextEntry, tieBreak);
      } else {
        const currentValue = isSocial ? currentEntry.socialLevel : currentEntry.level;
        const nextValue = isSocial ? nextEntry.socialLevel : nextEntry.level;
        isTie = 
          currentValue === nextValue &&
          currentEntry.reliability === nextEntry.reliability &&
          tieBreakValue(currentEntry, tieBreak) === tieBreakValue(nextEntry, tieBreak);
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

type RatingLeaderboardCandidate = {
  id: string;
  level: number;
  reliability: number;
  gamesWon: number;
  gamesPlayed: number;
};

export class RankingService {
  static async qualifyAndRankRatingLeaderboard<T extends RatingLeaderboardCandidate>(
    users: T[],
    sportForUser: (user: T) => Sport,
  ): Promise<{
    users: Array<T & { qualifiesForRating: boolean }>;
    rankMap: Map<string, number>;
  }> {
    const recentRatedUserIds = await RankingService.getUserIdsWithRatedGameSinceBySport(
      users.map((user) => ({ userId: user.id, sport: sportForUser(user) })),
      ratingLeaderboardActivitySince(),
    );
    const ordered = orderRatingLeaderboard(
      users.map((user) => ({
        ...user,
        qualifiesForRating: qualifiesForRatingRank({
          gamesPlayed: user.gamesPlayed,
          hasRecentRatedGame: recentRatedUserIds.has(user.id),
        }),
      })),
    );
    return {
      users: ordered,
      rankMap: calculateRanks(
        ordered.filter((user) => user.qualifiesForRating),
        false,
        false,
        'gamesWon',
      ),
    };
  }

  static async getCityLeaderboardRanks(cityId: string, sport: Sport): Promise<Map<string, number>> {
    const usersRaw = await prisma.user.findMany({
      where: {
        currentCityId: cityId,
        isActive: true,
      },
      select: {
        ...USER_SELECT_FIELDS,
        sportProfiles: {
          select: USER_SPORT_PROFILE_SELECT,
        },
      },
    });

    const candidates = usersRaw
      .map((u) => {
        const snap = resolveUserSportSnapshot(u, sport);
        return {
          id: u.id,
          level: snap.level,
          reliability: snap.reliability,
          gamesPlayed: snap.gamesPlayed,
          gamesWon: snap.gamesWon,
        };
      })
      .filter((u) => u.gamesPlayed > 0);

    return calculateRanks(
      orderPlayedRatingLeaderboard(candidates),
      false,
      false,
      'gamesWon',
    );
  }

  static async getUserIdsWithRatedGameSince(
    userIds: string[],
    sport: Sport,
    since: Date,
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const wanted = new Set(userIds);
    const rows = await prisma.gameParticipant.groupBy({
      by: ['userId'],
      where: {
        status: 'PLAYING',
        game: {
          sport,
          resultsStatus: ResultsStatus.FINAL,
          affectsRating: true,
          startTime: { gte: since },
        },
      },
      _count: {
        userId: true,
      },
    });

    const recent = new Set<string>();
    for (const row of rows) {
      if (wanted.has(row.userId)) recent.add(row.userId);
    }
    return recent;
  }

  static async getUserIdsWithRatedGameSinceBySport(
    userSports: Array<{ userId: string; sport: Sport }>,
    since: Date,
  ): Promise<Set<string>> {
    const idsBySport = new Map<Sport, string[]>();
    for (const { userId, sport } of userSports) {
      const ids = idsBySport.get(sport);
      if (ids) ids.push(userId);
      else idsBySport.set(sport, [userId]);
    }

    const foundSets = await Promise.all(
      [...idsBySport.entries()].map(([sport, ids]) =>
        RankingService.getUserIdsWithRatedGameSince(ids, sport, since),
      ),
    );

    const recent = new Set<string>();
    for (const found of foundSets) {
      for (const id of found) recent.add(id);
    }
    return recent;
  }

  static async getGamesInLast30Days(
    userIds: string[],
    cityId: string,
    sport: Sport,
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const userGameCountsResult = await prisma.gameParticipant.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: 'PLAYING',
        game: {
          cityId: cityId,
          sport,
          resultsStatus: ResultsStatus.FINAL,
          startTime: { gte: thirtyDaysAgo },
        },
      },
      _count: {
        userId: true,
      },
    });

    const gamesMap = new Map<string, number>();
    for (const result of userGameCountsResult) {
      gamesMap.set(result.userId, result._count.userId);
    }

    return gamesMap;
  }
}
