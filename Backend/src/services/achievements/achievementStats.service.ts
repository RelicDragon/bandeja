import { Prisma } from '@prisma/client';
import type { PartnerHabitCounters } from '@bandeja/shared/achievements';
import prisma from '../../config/database';

type DbClient = Prisma.TransactionClient | typeof prisma;

export type OrganizeStatsCounters = {
  organizedGames: number;
  organizedTournaments: number;
  organizedBars: number;
};

export class AchievementStatsRefreshError extends Error {
  readonly startedRevision: number;
  readonly originalError: unknown;

  constructor(startedRevision: number, originalError: unknown) {
    super(
      originalError instanceof Error
        ? originalError.message
        : 'Achievement stats refresh failed',
    );
    this.name = 'AchievementStatsRefreshError';
    this.startedRevision = startedRevision;
    this.originalError = originalError;
  }
}

/**
 * Serialize source-of-truth counter recalculation for one user and domain.
 * The caller must keep this transaction open through the matching upsert.
 */
export async function lockAchievementStatsWrite(params: {
  userId: string;
  kind: 'organize' | 'partner';
  tx: Prisma.TransactionClient;
}): Promise<void> {
  const lockKey = `achievement-stats:${params.kind}:${params.userId}`;
  await params.tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
  `;
}

/**
 * `revision` is the monotonic optimistic invalidation token for a counter
 * refresh. A refresh may only commit if nothing changed after it started
 * reading source history.
 */
export async function beginAchievementStatsRefresh(
  userId: string,
  tx?: DbClient,
): Promise<number> {
  const db = tx ?? prisma;
  const row = await db.userAchievementStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { revision: true },
  });
  return row.revision;
}

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
      revision: 1,
      organizeRefreshedAt: now,
      organizeRepairFailures: 0,
      organizeRepairFailedAt: null,
    },
    update: {
      ...params.organize,
      revision: { increment: 1 },
      organizeRefreshedAt: now,
      organizeRepairFailures: 0,
      organizeRepairFailedAt: null,
    },
  });
}

export async function commitOrganizeAchievementStatsIfUnchanged(params: {
  userId: string;
  startedRevision: number;
  organize: OrganizeStatsCounters;
  tx?: DbClient;
}): Promise<boolean> {
  const db = params.tx ?? prisma;
  const result = await db.userAchievementStats.updateMany({
    where: {
      userId: params.userId,
      revision: params.startedRevision,
    },
    data: {
      ...params.organize,
      organizeRefreshedAt: new Date(),
      organizeRepairFailures: 0,
      organizeRepairFailedAt: null,
    },
  });
  return result.count === 1;
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
      revision: 1,
      partnerRefreshedAt: now,
      partnerRepairFailures: 0,
      partnerRepairFailedAt: null,
    },
    update: {
      ...params.partner,
      revision: { increment: 1 },
      partnerRefreshedAt: now,
      partnerRepairFailures: 0,
      partnerRepairFailedAt: null,
    },
  });
}

export async function commitPartnerAchievementStatsIfUnchanged(params: {
  userId: string;
  startedRevision: number;
  partner: PartnerHabitCounters;
  tx?: DbClient;
}): Promise<boolean> {
  const db = params.tx ?? prisma;
  const result = await db.userAchievementStats.updateMany({
    where: {
      userId: params.userId,
      revision: params.startedRevision,
    },
    data: {
      ...params.partner,
      partnerRefreshedAt: new Date(),
      partnerRepairFailures: 0,
      partnerRepairFailedAt: null,
    },
  });
  return result.count === 1;
}

/** Mark cached organize/partner counters stale so cabinet reloads recompute. */
export async function invalidateAchievementStatsCache(params: {
  userIds: string[];
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  if (!params.tx) {
    await prisma.$transaction((tx) =>
      invalidateAchievementStatsCache({
        userIds: params.userIds,
        tx,
      }),
    );
    return;
  }
  const ids = [...new Set(params.userIds.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
  if (ids.length === 0) return;
  const db = params.tx;
  for (const kind of ['organize', 'partner'] as const) {
    for (const userId of ids) {
      await lockAchievementStatsWrite({ userId, kind, tx: db });
    }
  }
  await db.userAchievementStats.createMany({
    data: ids.map((userId) => ({ userId })),
    skipDuplicates: true,
  });
  await db.userAchievementStats.updateMany({
    where: { userId: { in: ids } },
    data: {
      organizeRefreshedAt: null,
      partnerRefreshedAt: null,
      revision: { increment: 1 },
      organizeRepairFailures: 0,
      partnerRepairFailures: 0,
      organizeRepairFailedAt: null,
      partnerRepairFailedAt: null,
    },
  });
}

export async function recordAchievementStatsRepairFailure(params: {
  userId: string;
  kind: 'organize' | 'partner';
  startedRevision: number;
  tx?: DbClient;
}): Promise<boolean> {
  const db = params.tx ?? prisma;
  const result = await db.userAchievementStats.updateMany({
    where: {
      userId: params.userId,
      revision: params.startedRevision,
    },
    data:
      params.kind === 'organize'
        ? {
            organizeRepairFailures: { increment: 1 },
            organizeRepairFailedAt: new Date(),
          }
        : {
            partnerRepairFailures: { increment: 1 },
            partnerRepairFailedAt: new Date(),
          },
  });
  return result.count === 1;
}

export async function invalidateAchievementStatsForGame(params: {
  gameId: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  if (!params.tx) {
    await prisma.$transaction((tx) =>
      invalidateAchievementStatsForGame({
        gameId: params.gameId,
        tx,
      }),
    );
    return;
  }
  const db = params.tx;
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
