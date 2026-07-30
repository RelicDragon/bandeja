import { Prisma } from '@prisma/client';
import type { AchievementLeaderboardFamily } from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import {
  AchievementStatsRefreshError,
  recordAchievementStatsRepairFailure,
} from '../achievements/achievementStats.service';
import { refreshOrganizeHabitCounters } from '../achievements/organizeGrant.service';
import { refreshPartnerHabitCounters } from '../achievements/partnerGrant.service';
import { projectEmbeddedUserByPrimarySport } from '../user/projectEmbeddedBasicUsers';
import { ApiError } from '../../utils/ApiError';
import type { LeaderboardGenderFilter } from './leaderboardGenderFilter';

const ACHIEVEMENT_LEADERBOARD_LIMIT = 100;
const STATS_REFRESH_CONCURRENCY = 6;
const STATS_REPAIR_BATCH_SIZE = 12;
const STATS_REPAIR_MAX_FAILURES = 3;
const STATS_REPAIR_QUARANTINE_MS = 15 * 60 * 1000;
const STATS_REPAIR_NEXT_BATCH_DELAY_MS = 250;
const STATS_REPAIR_LOCK_RETRY_MS = 1_000;
const STATS_REPAIR_ERROR_RETRY_MS = 2_000;
const STATS_REPAIR_ADVISORY_LOCK: Record<CachedStatsKind, number> = {
  organize: 7_132_001,
  partner: 7_132_002,
};

type AchievementScoreRow = {
  userId: string;
  progress: number | bigint;
  rank: number | bigint;
  position: number | bigint;
  total: number | bigint;
};

type DbClient = Prisma.TransactionClient | typeof prisma;
type CachedAchievementFamily = Exclude<
  AchievementLeaderboardFamily,
  'HABIT_VOLUME' | 'HABIT_WINS' | 'HABIT_STREAK' | 'PODIUM'
>;
type CachedStatsKind = 'organize' | 'partner';

const refreshesInFlight = new Map<string, Promise<void>>();
const repairJobsInFlight = new Map<string, Promise<void>>();
const repairRetryTimers = new Map<string, NodeJS.Timeout>();

function userWhereSql(params: {
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
}): Prisma.Sql {
  const conditions = [Prisma.sql`u."isActive" = true`];
  if (params.currentCityId) {
    conditions.push(Prisma.sql`u."currentCityId" = ${params.currentCityId}`);
  }
  if (params.gender) {
    conditions.push(Prisma.sql`u."gender" = ${params.gender}::"Gender"`);
  }
  return Prisma.join(conditions, ' AND ');
}

function sportProfileScoresSql(
  family: 'HABIT_VOLUME' | 'HABIT_WINS' | 'HABIT_STREAK',
  where: Prisma.Sql,
): Prisma.Sql {
  if (family === 'HABIT_VOLUME') {
    return Prisma.sql`
      SELECT
        u.id AS "userId",
        SUM(usp."gamesPlayed")::integer AS progress
      FROM "User" u
      INNER JOIN "UserSportProfile" usp ON usp."userId" = u.id
      WHERE ${where}
      GROUP BY u.id
      HAVING SUM(usp."gamesPlayed") > 0
    `;
  }
  if (family === 'HABIT_WINS') {
    return Prisma.sql`
      SELECT
        u.id AS "userId",
        SUM(usp."gamesWon")::integer AS progress
      FROM "User" u
      INNER JOIN "UserSportProfile" usp ON usp."userId" = u.id
      WHERE ${where}
      GROUP BY u.id
      HAVING SUM(usp."gamesWon") > 0
    `;
  }
  return Prisma.sql`
    SELECT
      u.id AS "userId",
      MAX(usp."playStreakCount")::integer AS progress
    FROM "User" u
    INNER JOIN "UserSportProfile" usp ON usp."userId" = u.id
    WHERE ${where}
    GROUP BY u.id
    HAVING MAX(usp."playStreakCount") > 0
  `;
}

function podiumScoresSql(where: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT
      u.id AS "userId",
      COUNT(ua.id)::integer AS progress
    FROM "User" u
    INNER JOIN "UserAchievement" ua
      ON ua."userId" = u.id
      AND ua."isActive" = true
      AND ua."definitionId" IN ('podium_gold', 'podium_silver', 'podium_bronze')
    WHERE ${where}
    GROUP BY u.id
    HAVING COUNT(ua.id) > 0
  `;
}

function cachedStatScoresSql(
  family: CachedAchievementFamily,
  where: Prisma.Sql,
): Prisma.Sql {
  const statsKind = cachedStatsKind(family);
  const progressSql = (() => {
    switch (family) {
      case 'HABIT_ORGANIZE_GAME':
        return Prisma.sql`s."organizedGames"`;
      case 'HABIT_ORGANIZE_TOURNAMENT':
        return Prisma.sql`s."organizedTournaments"`;
      case 'HABIT_ORGANIZE_BAR':
        return Prisma.sql`s."organizedBars"`;
      case 'HABIT_GIANT_KILLER':
        return Prisma.sql`s."giantKillerWins"`;
      case 'HABIT_DYNAMIC_DUO':
        return Prisma.sql`s."dynamicDuoMaxWins"`;
      case 'HABIT_OPEN_COURT':
        return Prisma.sql`s."openCourtPartners"`;
    }
  })();

  return Prisma.sql`
    SELECT
      u.id AS "userId",
      ${progressSql}::integer AS progress
    FROM "User" u
    INNER JOIN "UserAchievementStats" s ON s."userId" = u.id
    WHERE ${where}
      AND ${
        statsKind === 'organize'
          ? Prisma.sql`s."organizeRefreshedAt" IS NOT NULL`
          : Prisma.sql`s."partnerRefreshedAt" IS NOT NULL`
      }
      AND ${progressSql} > 0
  `;
}

function achievementScoresSql(
  family: AchievementLeaderboardFamily,
  where: Prisma.Sql,
): Prisma.Sql {
  if (
    family === 'HABIT_VOLUME' ||
    family === 'HABIT_WINS' ||
    family === 'HABIT_STREAK'
  ) {
    return sportProfileScoresSql(family, where);
  }
  if (family === 'PODIUM') return podiumScoresSql(where);
  return cachedStatScoresSql(family, where);
}

function toSafeNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function cachedStatsKind(
  family: CachedAchievementFamily,
): CachedStatsKind {
  return family === 'HABIT_ORGANIZE_GAME' ||
    family === 'HABIT_ORGANIZE_TOURNAMENT' ||
    family === 'HABIT_ORGANIZE_BAR'
    ? 'organize'
    : 'partner';
}

function isCachedAchievementFamily(
  family: AchievementLeaderboardFamily,
): family is CachedAchievementFamily {
  return family !== 'HABIT_VOLUME' &&
    family !== 'HABIT_WINS' &&
    family !== 'HABIT_STREAK' &&
    family !== 'PODIUM';
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex]!;
        nextIndex += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

async function refreshCachedStatsForUser(params: {
  userId: string;
  kind: CachedStatsKind;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const refresh = async () => {
    if (params.kind === 'organize') {
      await refreshOrganizeHabitCounters(params.userId, params.tx);
    } else {
      await refreshPartnerHabitCounters(params.userId, params.tx);
    }
  };

  // A transaction has its own connection and lifetime, so it must not share
  // refresh work with requests using another client.
  if (params.tx) {
    await refresh();
    return;
  }

  const key = `${params.kind}:${params.userId}`;
  const existing = refreshesInFlight.get(key);
  if (existing) {
    await existing;
    return;
  }

  const pending = refresh().finally(() => {
    if (refreshesInFlight.get(key) === pending) {
      refreshesInFlight.delete(key);
    }
  });
  refreshesInFlight.set(key, pending);
  await pending;
}

function staleCachedStatsUserWhere(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
}): Prisma.UserWhereInput {
  const staleRelation: Prisma.UserWhereInput =
    params.kind === 'organize'
      ? { achievementStats: { is: { organizeRefreshedAt: null } } }
      : { achievementStats: { is: { partnerRefreshedAt: null } } };
  return {
    isActive: true,
    ...(params.currentCityId ? { currentCityId: params.currentCityId } : {}),
    ...(params.gender ? { gender: params.gender } : {}),
    OR: [
      { achievementStats: { is: null } },
      staleRelation,
    ],
  };
}

function repairJobKey(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
}): string {
  return [
    params.kind,
    params.currentCityId ?? 'global',
    params.gender ?? 'all',
  ].join(':');
}

function repairFailureRelation(
  kind: CachedStatsKind,
  comparison: { lt: number } | { gte: number },
): Prisma.UserWhereInput {
  return kind === 'organize'
    ? {
        achievementStats: {
          is: { organizeRepairFailures: comparison },
        },
      }
    : {
        achievementStats: {
          is: { partnerRepairFailures: comparison },
        },
      };
}

function repairFailedAtRelation(
  kind: CachedStatsKind,
  comparison: { lte: Date } | { gt: Date },
): Prisma.UserWhereInput {
  return kind === 'organize'
    ? {
        achievementStats: {
          is: { organizeRepairFailedAt: comparison },
        },
      }
    : {
        achievementStats: {
          is: { partnerRepairFailedAt: comparison },
        },
      };
}

function repairableCachedStatsUserWhere(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
}): Prisma.UserWhereInput {
  const quarantineExpiredAt = new Date(
    Date.now() - STATS_REPAIR_QUARANTINE_MS,
  );
  return {
    AND: [
      staleCachedStatsUserWhere(params),
      {
        OR: [
          { achievementStats: { is: null } },
          repairFailureRelation(params.kind, {
            lt: STATS_REPAIR_MAX_FAILURES,
          }),
          repairFailedAtRelation(params.kind, {
            lte: quarantineExpiredAt,
          }),
        ],
      },
    ],
  };
}

type RepairBatchResult = 'done' | 'more' | 'locked';
type CachedStatsRefreshWorker = (params: {
  userId: string;
  kind: CachedStatsKind;
}) => Promise<void>;

async function repairOneCachedStatsBatch(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
  refreshUser?: CachedStatsRefreshWorker;
}): Promise<RepairBatchResult> {
  return prisma.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
        SELECT pg_try_advisory_xact_lock(
          CAST(${STATS_REPAIR_ADVISORY_LOCK[params.kind]} AS bigint)
        ) AS acquired
      `);
      if (!lock?.acquired) return 'locked';

      const where = repairableCachedStatsUserWhere(params);
      const staleUsers = await tx.user.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: STATS_REPAIR_BATCH_SIZE,
      });
      if (staleUsers.length === 0) return 'done';

      await runWithConcurrency(
        staleUsers,
        STATS_REFRESH_CONCURRENCY,
        async ({ id }) => {
          try {
            await (params.refreshUser ?? refreshCachedStatsForUser)({
              userId: id,
              kind: params.kind,
            });
          } catch (error) {
            if (error instanceof AchievementStatsRefreshError) {
              await recordAchievementStatsRepairFailure({
                userId: id,
                kind: params.kind,
                startedRevision: error.startedRevision,
              });
            }
            console.error('[achievement-leaderboard] user stats repair failed', {
              userId: id,
              kind: params.kind,
              error,
            });
          }
        },
      );

      const more = await tx.user.findFirst({
        where,
        select: { id: true },
      });
      return more ? 'more' : 'done';
    },
    {
      maxWait: 5_000,
      timeout: 60_000,
    },
  );
}

/** Test-only entry point for exercising worker failure isolation. */
export async function repairOneAchievementStatsBatchForTest(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
  refreshUser: CachedStatsRefreshWorker;
}): Promise<void> {
  await repairOneCachedStatsBatch(params);
}

function queueCachedStatsRepair(
  params: {
    kind: CachedStatsKind;
    currentCityId: string | null;
    gender: LeaderboardGenderFilter;
  },
  delayMs: number,
): void {
  const key = repairJobKey(params);
  if (repairJobsInFlight.has(key) || repairRetryTimers.has(key)) return;
  const timer = setTimeout(() => {
    repairRetryTimers.delete(key);
    scheduleCachedStatsRepair(params);
  }, delayMs);
  timer.unref();
  repairRetryTimers.set(key, timer);
}

function scheduleCachedStatsRepair(params: {
  kind: CachedStatsKind;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
}): void {
  const key = repairJobKey(params);
  if (repairJobsInFlight.has(key)) return;

  let nextDelayMs: number | null = null;
  const pending = repairOneCachedStatsBatch(params)
    .then((result) => {
      if (result === 'more') {
        nextDelayMs = STATS_REPAIR_NEXT_BATCH_DELAY_MS;
      } else if (result === 'locked') {
        nextDelayMs = STATS_REPAIR_LOCK_RETRY_MS;
      }
    })
    .catch((error: unknown) => {
      nextDelayMs = STATS_REPAIR_ERROR_RETRY_MS;
      console.error('[achievement-leaderboard] background stats repair failed', {
        kind: params.kind,
        currentCityId: params.currentCityId,
        gender: params.gender,
        error,
      });
    })
    .finally(() => {
      if (repairJobsInFlight.get(key) === pending) {
        repairJobsInFlight.delete(key);
      }
      if (nextDelayMs != null) {
        queueCachedStatsRepair(params, nextDelayMs);
      }
    });
  repairJobsInFlight.set(key, pending);
}

/** Test-only drain for database integration coverage and cleanup safety. */
export async function waitForAchievementStatsRepairsForTest(): Promise<void> {
  while (repairJobsInFlight.size > 0 || repairRetryTimers.size > 0) {
    await Promise.all([...repairJobsInFlight.values()]);
    if (repairRetryTimers.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/**
 * Achievement stats are deliberately invalidated by setting their refresh
 * timestamp to null while retaining the previous numeric value. Never rank
 * those old values. Production requests only detect staleness and start a
 * bounded background repair job; they never scan user histories in the GET
 * request. Transaction-backed integration callers repair inline because their
 * uncommitted fixtures are invisible to the shared background client.
 */
async function ensureFreshCachedStats(params: {
  family: CachedAchievementFamily;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
  db: DbClient;
  repairInline: boolean;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const kind = cachedStatsKind(params.family);
  const where = staleCachedStatsUserWhere({
    kind,
    currentCityId: params.currentCityId,
    gender: params.gender,
  });

  if (params.repairInline) {
    if (!params.tx) {
      throw new Error('Inline achievement stats repair requires a transaction');
    }
    const staleUsers = await params.db.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    await runWithConcurrency(
      staleUsers,
      STATS_REFRESH_CONCURRENCY,
      ({ id }) => refreshCachedStatsForUser({
        userId: id,
        kind,
        tx: params.tx,
      }),
    );
    return;
  }

  const failedUser = await params.db.user.findFirst({
    where: {
      AND: [
        staleCachedStatsUserWhere({
          kind,
          currentCityId: params.currentCityId,
          gender: params.gender,
        }),
        repairFailureRelation(kind, {
          gte: STATS_REPAIR_MAX_FAILURES,
        }),
        repairFailedAtRelation(kind, {
          gt: new Date(Date.now() - STATS_REPAIR_QUARANTINE_MS),
        }),
      ],
    },
    select: {
      id: true,
      achievementStats: {
        select: {
          organizeRepairFailedAt: true,
          partnerRepairFailedAt: true,
        },
      },
    },
  });
  if (failedUser) {
    const failedAt =
      kind === 'organize'
        ? failedUser.achievementStats?.organizeRepairFailedAt
        : failedUser.achievementStats?.partnerRepairFailedAt;
    const retryAt =
      (failedAt?.getTime() ?? Date.now()) +
      STATS_REPAIR_QUARANTINE_MS;
    throw new ApiError(
      503,
      'Achievement rankings need maintenance. Please try again later.',
      true,
      {
        code: 'ranking.achievementStatsRepairFailed',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((retryAt - Date.now()) / 1000),
        ),
      },
    );
  }

  const staleUser = await params.db.user.findFirst({
    where,
    select: { id: true },
  });
  if (!staleUser) return;

  scheduleCachedStatsRepair({
    kind,
    currentCityId: params.currentCityId,
    gender: params.gender,
  });
  throw new ApiError(
    503,
    'Achievement rankings are updating. Please try again.',
    true,
    {
      code: 'ranking.achievementStatsRefreshing',
      retryAfterSeconds: 2,
    },
  );
}

export type AchievementLeaderboardEntry = ReturnType<
  typeof projectEmbeddedUserByPrimarySport
> & {
  progress: number;
  rank: number;
};

export type AchievementLeaderboardContext = {
  leaderboard: AchievementLeaderboardEntry[];
  viewerEntry: AchievementLeaderboardEntry | null;
  total: number;
  limit: number;
  isTruncated: boolean;
};

type AchievementLeaderboardParams = {
  family: AchievementLeaderboardFamily;
  viewerUserId: string;
  currentCityId: string | null;
  gender: LeaderboardGenderFilter;
  /** Test/transaction hook; production callers use the shared Prisma client. */
  tx?: Prisma.TransactionClient;
};

/**
 * Rank only the requested achievement family. PostgreSQL performs aggregation,
 * ranking, and top-100 selection; user profile payloads are fetched only for
 * those rows plus the viewer.
 */
async function getAchievementLeaderboardContextWithDb(
  params: AchievementLeaderboardParams & {
    db: DbClient;
    repairInline: boolean;
  },
): Promise<AchievementLeaderboardContext> {
  const db = params.db;
  if (isCachedAchievementFamily(params.family)) {
    await ensureFreshCachedStats({
      family: params.family,
      currentCityId: params.currentCityId,
      gender: params.gender,
      db,
      repairInline: params.repairInline,
      tx: params.tx,
    });
  }

  const scores = achievementScoresSql(
    params.family,
    userWhereSql({
      currentCityId: params.currentCityId,
      gender: params.gender,
    }),
  );

  const rows = await db.$queryRaw<AchievementScoreRow[]>(Prisma.sql`
    WITH scored AS (
      ${scores}
    ),
    ranked AS (
      SELECT
        "userId",
        progress,
        RANK() OVER (ORDER BY progress DESC)::integer AS rank,
        ROW_NUMBER() OVER (
          ORDER BY progress DESC, "userId" ASC
        )::integer AS position,
        COUNT(*) OVER ()::integer AS total
      FROM scored
    )
    SELECT "userId", progress, rank, position, total
    FROM ranked
    WHERE position <= ${ACHIEVEMENT_LEADERBOARD_LIMIT}
      OR "userId" = ${params.viewerUserId}
    ORDER BY position ASC
  `);

  if (rows.length === 0) {
    return {
      leaderboard: [],
      viewerEntry: null,
      total: 0,
      limit: ACHIEVEMENT_LEADERBOARD_LIMIT,
      isTruncated: false,
    };
  }

  const users = await db.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) } },
    select: USER_SELECT_WITH_SPORT_PROFILES,
  });
  const usersById = new Map(
    users.map((user) => [
      user.id,
      projectEmbeddedUserByPrimarySport(user),
    ] as const),
  );

  const entries = rows.flatMap((row) => {
    const user = usersById.get(row.userId);
    if (!user) return [];
    return [{
      ...user,
      progress: toSafeNumber(row.progress),
      rank: toSafeNumber(row.rank),
    }];
  });

  const topUserIds = new Set(
    rows
      .filter((row) => toSafeNumber(row.position) <= ACHIEVEMENT_LEADERBOARD_LIMIT)
      .map((row) => row.userId),
  );
  const total = toSafeNumber(rows[0]!.total);

  return {
    leaderboard: entries.filter((entry) => topUserIds.has(entry.id)),
    viewerEntry: entries.find((entry) => entry.id === params.viewerUserId) ?? null,
    total,
    limit: ACHIEVEMENT_LEADERBOARD_LIMIT,
    isTruncated: total > ACHIEVEMENT_LEADERBOARD_LIMIT,
  };
}

export async function getAchievementLeaderboardContext(
  params: AchievementLeaderboardParams,
): Promise<AchievementLeaderboardContext> {
  if (params.tx) {
    return getAchievementLeaderboardContextWithDb({
      ...params,
      db: params.tx,
      repairInline: true,
    });
  }

  if (!isCachedAchievementFamily(params.family)) {
    return getAchievementLeaderboardContextWithDb({
      ...params,
      db: prisma,
      repairInline: false,
    });
  }

  // The freshness check and ranking query must share one snapshot. Otherwise
  // an invalidation committed between them could produce a successful but
  // incomplete leaderboard that the client would cache.
  return prisma.$transaction(
    (tx) =>
      getAchievementLeaderboardContextWithDb({
        ...params,
        db: tx,
        tx,
        repairInline: false,
      }),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}
