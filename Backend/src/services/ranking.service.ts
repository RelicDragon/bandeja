import prisma from '../config/database';
import { Sport, ResultsStatus } from '@prisma/client';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../utils/constants';
import { resolveUserSportSnapshot } from './user/userSportProfile.service';

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

export class RankingService {
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

    const allUsers = usersRaw
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
      .filter((u) => u.gamesPlayed > 0)
      .sort((a, b) => {
        if (a.level !== b.level) return b.level - a.level;
        if (a.reliability !== b.reliability) return b.reliability - a.reliability;
        if (a.gamesWon !== b.gamesWon) return b.gamesWon - a.gamesWon;
        return a.id.localeCompare(b.id);
      });

    return calculateRanks(allUsers, false, false, 'gamesWon');
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
