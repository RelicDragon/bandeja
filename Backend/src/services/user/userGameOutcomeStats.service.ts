import { Sport } from '@prisma/client';
import prisma from '../../config/database';

export type GamesStatBucket = {
  type: '30' | '90' | 'all';
  wins: number;
  ties: number;
  losses: number;
  totalMatches: number;
};

function outcomeWhere(userId: string, sport?: Sport, createdAtGte?: Date) {
  return {
    userId,
    ...(createdAtGte ? { createdAt: { gte: createdAtGte } } : {}),
    ...(sport ? { game: { sport } } : {}),
  };
}

export async function getUserGameOutcomeAggregates(
  userId: string,
  sport?: Sport,
): Promise<{
  gamesLast30Days: number;
  gamesStats: GamesStatBucket[];
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [gamesLast30Days, agg30, agg90, aggAll] = await Promise.all([
    prisma.gameOutcome.count({
      where: outcomeWhere(userId, sport, thirtyDaysAgo),
    }),
    prisma.gameOutcome.aggregate({
      where: outcomeWhere(userId, sport, thirtyDaysAgo),
      _sum: { wins: true, ties: true, losses: true },
    }),
    prisma.gameOutcome.aggregate({
      where: outcomeWhere(userId, sport, ninetyDaysAgo),
      _sum: { wins: true, ties: true, losses: true },
    }),
    prisma.gameOutcome.aggregate({
      where: outcomeWhere(userId, sport),
      _sum: { wins: true, ties: true, losses: true },
    }),
  ]);

  const bucket = (
    sum: typeof agg30,
    type: '30' | '90' | 'all'
  ): GamesStatBucket => {
    const w = sum._sum.wins || 0;
    const ti = sum._sum.ties || 0;
    const l = sum._sum.losses || 0;
    return { type, wins: w, ties: ti, losses: l, totalMatches: w + ti + l };
  };

  return {
    gamesLast30Days,
    gamesStats: [bucket(agg30, '30'), bucket(agg90, '90'), bucket(aggAll, 'all')],
  };
}
