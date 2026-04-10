import prisma from '../../config/database';

export type GamesStatBucket = {
  type: '30' | '90' | 'all';
  wins: number;
  ties: number;
  losses: number;
  totalMatches: number;
};

export async function getUserGameOutcomeAggregates(userId: string): Promise<{
  gamesLast30Days: number;
  gamesStats: GamesStatBucket[];
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [gamesLast30Days, agg30, agg90, aggAll] = await Promise.all([
    prisma.gameOutcome.count({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.gameOutcome.aggregate({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      _sum: { wins: true, ties: true, losses: true },
    }),
    prisma.gameOutcome.aggregate({
      where: { userId, createdAt: { gte: ninetyDaysAgo } },
      _sum: { wins: true, ties: true, losses: true },
    }),
    prisma.gameOutcome.aggregate({
      where: { userId },
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
