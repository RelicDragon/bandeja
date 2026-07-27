import { Prisma } from '@prisma/client';
import type { PartnerHabitCounters } from '@bandeja/shared/achievements';
import prisma from '../../config/database';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type OrganizeStatsCounters = {
  organizedGames: number;
  organizedTournaments: number;
  organizedBars: number;
};

export async function readOrganizeAchievementStats(
  userId: string,
  tx?: DbClient,
): Promise<OrganizeStatsCounters | null> {
  const db = tx ?? prisma;
  const row = await db.userAchievementStats.findUnique({ where: { userId } });
  if (!row?.organizeRefreshedAt) return null;
  return {
    organizedGames: row.organizedGames,
    organizedTournaments: row.organizedTournaments,
    organizedBars: row.organizedBars,
  };
}

export async function readPartnerAchievementStats(
  userId: string,
  tx?: DbClient,
): Promise<PartnerHabitCounters | null> {
  const db = tx ?? prisma;
  const row = await db.userAchievementStats.findUnique({ where: { userId } });
  if (!row?.partnerRefreshedAt) return null;
  return {
    giantKillerWins: row.giantKillerWins,
    dynamicDuoMaxWins: row.dynamicDuoMaxWins,
    openCourtPartners: row.openCourtPartners,
  };
}

export async function upsertOrganizeAchievementStats(params: {
  userId: string;
  organize: OrganizeStatsCounters;
  tx?: DbClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const now = new Date();
  await db.userAchievementStats.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      ...params.organize,
      organizeRefreshedAt: now,
    },
    update: {
      ...params.organize,
      organizeRefreshedAt: now,
    },
  });
}

export async function upsertPartnerAchievementStats(params: {
  userId: string;
  partner: PartnerHabitCounters;
  tx?: DbClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const now = new Date();
  await db.userAchievementStats.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      ...params.partner,
      partnerRefreshedAt: now,
    },
    update: {
      ...params.partner,
      partnerRefreshedAt: now,
    },
  });
}

/** Mark cached organize/partner counters stale so cabinet reloads recompute. */
export async function invalidateAchievementStatsCache(params: {
  userIds: string[];
  tx?: DbClient;
}): Promise<void> {
  const ids = [...new Set(params.userIds.filter(Boolean))];
  if (ids.length === 0) return;
  const db = params.tx ?? prisma;
  await db.userAchievementStats.updateMany({
    where: { userId: { in: ids } },
    data: {
      organizeRefreshedAt: null,
      partnerRefreshedAt: null,
    },
  });
}

export async function invalidateAchievementStatsForGame(params: {
  gameId: string;
  tx?: DbClient;
}): Promise<void> {
  const db = params.tx ?? prisma;
  const [owners, players] = await Promise.all([
    db.gameParticipant.findMany({
      where: { gameId: params.gameId, role: 'OWNER' },
      select: { userId: true },
    }),
    db.teamPlayer.findMany({
      where: { team: { match: { round: { gameId: params.gameId } } } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  await invalidateAchievementStatsCache({
    userIds: [...owners, ...players].map((r) => r.userId),
    tx: db,
  });
}
