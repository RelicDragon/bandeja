import { Sport } from '@prisma/client';
import prisma from '../../config/database';

export type SportActivityRow = {
  sport: Sport;
  gamesLast7Days: number;
  gamesLast30Days: number;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function countFinishedGames(userId: string, sport: Sport, since: Date): Promise<number> {
  return prisma.gameParticipant.count({
    where: {
      userId,
      status: 'PLAYING',
      game: {
        sport,
        resultsStatus: 'FINAL',
        finishedDate: { gte: since },
      },
    },
  });
}

export async function getUserSportActivity(userId: string, sports: Sport[]): Promise<SportActivityRow[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const rows = await Promise.all(
    sports.map(async (sport) => {
      const [gamesLast7Days, gamesLast30Days] = await Promise.all([
        countFinishedGames(userId, sport, startOfUtcDay(sevenDaysAgo)),
        countFinishedGames(userId, sport, startOfUtcDay(thirtyDaysAgo)),
      ]);
      return { sport, gamesLast7Days, gamesLast30Days };
    })
  );

  return rows;
}
