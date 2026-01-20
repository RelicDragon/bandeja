import prisma from '../config/database';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { ResultsStatus } from '@prisma/client';

export const calculateRanks = (users: any[], isGames: boolean, isSocial: boolean): Map<string, number> => {
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

export class RankingService {
  static async getCityLeaderboardRanks(cityId: string): Promise<Map<string, number>> {
    const allUsers = await prisma.user.findMany({
      where: {
        currentCityId: cityId,
        isActive: true,
      },
      orderBy: [
        { level: 'desc' },
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

    return calculateRanks(allUsers, false, false);
  }

  static async getGamesInLast30Days(userIds: string[], cityId: string): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const userGameCountsResult = await prisma.gameParticipant.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        isPlaying: true,
        game: {
          cityId: cityId,
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
