import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  AchievementStatsRefreshError,
  beginAchievementStatsRefresh,
  commitOrganizeAchievementStatsIfUnchanged,
  commitPartnerAchievementStatsIfUnchanged,
  invalidateAchievementStatsCache,
  recordAchievementStatsRepairFailure,
  upsertOrganizeAchievementStats,
  upsertPartnerAchievementStats,
} from '../achievements/achievementStats.service';
import {
  grantOrganizeAchievementsForFinalizedGame,
  refreshOrganizeHabitCounters,
} from '../achievements/organizeGrant.service';
import { ApiError } from '../../utils/ApiError';
import {
  getAchievementLeaderboardContext,
  repairOneAchievementStatsBatchForTest,
  type AchievementLeaderboardContext,
  waitForAchievementStatsRepairsForTest,
} from './achievementLeaderboard.service';

const ROLLBACK = new Error('rollback achievement leaderboard test');

function byId(
  context: AchievementLeaderboardContext,
  userId: string,
) {
  return context.leaderboard.find((entry) => entry.id === userId);
}

async function verifyFamilies(tx: Prisma.TransactionClient): Promise<void> {
  const cityId = `leaderboard-city-${randomUUID()}`;
  const alphaId = `leaderboard-alpha-${randomUUID()}`;
  const betaId = `leaderboard-beta-${randomUUID()}`;
  const gammaId = `leaderboard-gamma-${randomUUID()}`;
  const staleId = `leaderboard-stale-${randomUUID()}`;
  const now = new Date();

  await tx.city.create({
    data: {
      id: cityId,
      name: 'Achievement Leaderboard Test',
      country: 'Test',
      timezone: 'UTC',
    },
  });
  await tx.user.createMany({
    data: [
      { id: alphaId, firstName: 'Alpha', currentCityId: cityId, gender: 'MALE' },
      { id: betaId, firstName: 'Beta', currentCityId: cityId, gender: 'MALE' },
      { id: gammaId, firstName: 'Gamma', currentCityId: cityId, gender: 'FEMALE' },
      { id: staleId, firstName: 'Stale', currentCityId: cityId, gender: 'MALE' },
    ],
  });
  await tx.userSportProfile.createMany({
    data: [
      {
        userId: alphaId,
        sport: 'PADEL',
        gamesPlayed: 10,
        gamesWon: 5,
        playStreakCount: 4,
      },
      {
        userId: alphaId,
        sport: 'TENNIS',
        gamesPlayed: 5,
        gamesWon: 2,
        playStreakCount: 8,
      },
      {
        userId: betaId,
        sport: 'PADEL',
        gamesPlayed: 15,
        gamesWon: 7,
        playStreakCount: 8,
      },
      {
        userId: gammaId,
        sport: 'PADEL',
        gamesPlayed: 100,
        gamesWon: 80,
        playStreakCount: 20,
      },
      {
        userId: staleId,
        sport: 'PADEL',
        gamesPlayed: 0,
        gamesWon: 0,
        playStreakCount: 0,
      },
    ],
  });
  await tx.userAchievementStats.createMany({
    data: [
      {
        userId: alphaId,
        organizedGames: 9,
        organizedTournaments: 8,
        organizedBars: 7,
        giantKillerWins: 6,
        dynamicDuoMaxWins: 5,
        openCourtPartners: 4,
        tieBreakSetWins: 32,
        organizeRefreshedAt: now,
        partnerRefreshedAt: now,
        tiebreakRefreshedAt: now,
      },
      {
        userId: betaId,
        organizedGames: 3,
        organizedTournaments: 2,
        organizedBars: 1,
        giantKillerWins: 3,
        dynamicDuoMaxWins: 2,
        openCourtPartners: 1,
        tieBreakSetWins: 3,
        organizeRefreshedAt: now,
        partnerRefreshedAt: now,
        tiebreakRefreshedAt: now,
      },
      {
        userId: gammaId,
        organizedGames: 90,
        organizedTournaments: 80,
        organizedBars: 70,
        giantKillerWins: 60,
        dynamicDuoMaxWins: 50,
        openCourtPartners: 40,
        tieBreakSetWins: 20,
        organizeRefreshedAt: now,
        partnerRefreshedAt: now,
        tiebreakRefreshedAt: now,
      },
      {
        userId: staleId,
        organizedGames: 999,
        organizedTournaments: 999,
        organizedBars: 999,
        giantKillerWins: 999,
        dynamicDuoMaxWins: 999,
        openCourtPartners: 999,
        tieBreakSetWins: 999,
        organizeRefreshedAt: null,
        partnerRefreshedAt: null,
        tiebreakRefreshedAt: null,
      },
    ],
  });
  await tx.userAchievement.createMany({
    data: [
      {
        userId: alphaId,
        definitionId: 'podium_gold',
        sourceKey: 'event-a',
      },
      {
        userId: alphaId,
        definitionId: 'podium_silver',
        sourceKey: 'event-b',
      },
      {
        userId: alphaId,
        definitionId: 'podium_bronze',
        sourceKey: 'event-revoked',
        isActive: false,
        revokedAt: now,
      },
      {
        userId: betaId,
        definitionId: 'podium_bronze',
        sourceKey: 'event-c',
      },
    ],
  });

  const base = {
    viewerUserId: betaId,
    currentCityId: cityId,
    gender: 'MALE' as const,
    tx,
  };

  const volume = await getAchievementLeaderboardContext({
    ...base,
    family: 'HABIT_VOLUME',
  });
  assert.equal(volume.total, 2);
  assert.deepEqual(
    volume.leaderboard.map(({ id, progress, rank }) => ({ id, progress, rank })),
    [
      { id: alphaId, progress: 15, rank: 1 },
      { id: betaId, progress: 15, rank: 1 },
    ].sort((a, b) => a.id.localeCompare(b.id)),
  );
  assert.equal(volume.viewerEntry?.rank, 1);

  const expectedProgress = new Map([
    ['HABIT_WINS', 7],
    ['HABIT_STREAK', 8],
    ['PODIUM', 2],
    ['HABIT_ORGANIZE_GAME', 9],
    ['HABIT_ORGANIZE_TOURNAMENT', 8],
    ['HABIT_ORGANIZE_BAR', 7],
    ['HABIT_GIANT_KILLER', 6],
    ['HABIT_DYNAMIC_DUO', 5],
    ['HABIT_OPEN_COURT', 4],
    ['HABIT_TIE_BREAK', 32],
  ] as const);
  for (const [family, progress] of expectedProgress) {
    const context = await getAchievementLeaderboardContext({
      ...base,
      family,
    });
    assert.equal(byId(context, alphaId)?.progress, progress, family);
    assert.equal(byId(context, staleId), undefined, `${family} must repair stale cache values`);
  }

  const allGenders = await getAchievementLeaderboardContext({
    ...base,
    family: 'HABIT_VOLUME',
    gender: null,
  });
  assert.equal(allGenders.leaderboard[0]?.id, gammaId);
  assert.equal(allGenders.leaderboard[0]?.progress, 100);

  const refreshStartedRevision = await beginAchievementStatsRefresh(staleId, tx);
  await invalidateAchievementStatsCache({
    userIds: [staleId],
    tx,
  });
  const staleCommitAccepted = await commitOrganizeAchievementStatsIfUnchanged({
    userId: staleId,
    startedRevision: refreshStartedRevision,
    organize: {
      organizedGames: 999,
      organizedTournaments: 999,
      organizedBars: 999,
    },
    tx,
  });
  assert.equal(
    staleCommitAccepted,
    false,
    'a refresh started before invalidation must not mark old counters fresh',
  );
  const staleFailureAccepted = await recordAchievementStatsRepairFailure({
    userId: staleId,
    kind: 'organize',
    startedRevision: refreshStartedRevision,
    tx,
  });
  assert.equal(
    staleFailureAccepted,
    false,
    'a failed refresh from an old revision must not quarantine the new revision',
  );
  const invalidatedStats = await tx.userAchievementStats.findUniqueOrThrow({
    where: { userId: staleId },
  });
  assert.equal(invalidatedStats.organizeRefreshedAt, null);
  assert.equal(invalidatedStats.organizeRepairFailures, 0);

  const organizeRepairRevision = await beginAchievementStatsRefresh(staleId, tx);
  await upsertOrganizeAchievementStats({
    userId: staleId,
    organize: {
      organizedGames: 12,
      organizedTournaments: 4,
      organizedBars: 2,
    },
    tx,
  });
  const organizeRepairOverwroteAuthoritative =
    await commitOrganizeAchievementStatsIfUnchanged({
      userId: staleId,
      startedRevision: organizeRepairRevision,
      organize: {
        organizedGames: 999,
        organizedTournaments: 999,
        organizedBars: 999,
      },
      tx,
    });
  assert.equal(
    organizeRepairOverwroteAuthoritative,
    false,
    'a repair must not overwrite newer event-driven organizer counters',
  );

  const partnerRepairRevision = await beginAchievementStatsRefresh(staleId, tx);
  await upsertPartnerAchievementStats({
    userId: staleId,
    partner: {
      giantKillerWins: 7,
      dynamicDuoMaxWins: 5,
      openCourtPartners: 9,
    },
    tx,
  });
  const partnerRepairOverwroteAuthoritative =
    await commitPartnerAchievementStatsIfUnchanged({
      userId: staleId,
      startedRevision: partnerRepairRevision,
      partner: {
        giantKillerWins: 999,
        dynamicDuoMaxWins: 999,
        openCourtPartners: 999,
      },
      tx,
    });
  assert.equal(
    partnerRepairOverwroteAuthoritative,
    false,
    'a repair must not overwrite newer event-driven partner counters',
  );
  const authoritativeStats = await tx.userAchievementStats.findUniqueOrThrow({
    where: { userId: staleId },
  });
  assert.equal(authoritativeStats.organizedGames, 12);
  assert.equal(authoritativeStats.giantKillerWins, 7);
}

async function verifyTopRankBoundary(tx: Prisma.TransactionClient): Promise<void> {
  const cityId = `leaderboard-boundary-city-${randomUUID()}`;
  const viewerId = `leaderboard-viewer-${randomUUID()}`;
  const distinctIds = Array.from(
    { length: 99 },
    (_, index) => `leaderboard-distinct-${index}-${randomUUID()}`,
  );
  const tiedIds = Array.from(
    { length: 3 },
    (_, index) => `leaderboard-tie-${index}-${randomUUID()}`,
  );
  const userIds = [...distinctIds, ...tiedIds, viewerId];

  await tx.city.create({
    data: {
      id: cityId,
      name: 'Achievement Leaderboard Boundary Test',
      country: 'Test',
      timezone: 'UTC',
    },
  });
  await tx.user.createMany({
    data: userIds.map((id) => ({
      id,
      currentCityId: cityId,
      gender: 'MALE' as const,
    })),
  });
  await tx.userSportProfile.createMany({
    data: [
      ...distinctIds.map((userId, index) => ({
        userId,
        sport: 'PADEL' as const,
        gamesPlayed: 200 - index,
      })),
      ...tiedIds.map((userId) => ({
        userId,
        sport: 'PADEL' as const,
        gamesPlayed: 50,
      })),
      {
        userId: viewerId,
        sport: 'PADEL' as const,
        gamesPlayed: 1,
      },
    ],
  });

  const context = await getAchievementLeaderboardContext({
    family: 'HABIT_VOLUME',
    viewerUserId: viewerId,
    currentCityId: cityId,
    gender: null,
    tx,
  });

  assert.equal(context.total, 103);
  assert.equal(context.limit, 100);
  assert.equal(context.isTruncated, true);
  assert.equal(context.leaderboard.length, 100, 'the response must honor its payload limit');
  assert.deepEqual(
    tiedIds.map((id) => byId(context, id)?.rank),
    [100, undefined, undefined],
    'a large boundary tie is deterministically bounded while retaining its shared rank',
  );
  assert.equal(context.viewerEntry?.rank, 103);
  assert.equal(byId(context, viewerId), undefined, 'viewer outside the top ranks is separate');
}

async function verifyBackgroundRepair(): Promise<void> {
  const cityId = `leaderboard-background-city-${randomUUID()}`;
  const userIds = Array.from(
    { length: 49 },
    (_, index) => `leaderboard-background-${index}-${randomUUID()}`,
  );

  await prisma.city.create({
    data: {
      id: cityId,
      name: 'Achievement Background Repair Test',
      country: 'Test',
      timezone: 'UTC',
    },
  });
  try {
    await prisma.user.createMany({
      data: userIds.map((id) => ({
        id,
        currentCityId: cityId,
        gender: 'MALE' as const,
      })),
    });
    await prisma.userAchievementStats.createMany({
      data: userIds.map((userId) => ({
        userId,
        organizedGames: 999,
        organizeRefreshedAt: null,
      })),
    });

    await assert.rejects(
      getAchievementLeaderboardContext({
        family: 'HABIT_ORGANIZE_GAME',
        viewerUserId: userIds[0]!,
        currentCityId: cityId,
        gender: null,
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.statusCode === 503 &&
        error.data?.code === 'ranking.achievementStatsRefreshing',
      'a stale scope must return the explicit background-refresh contract',
    );

    await waitForAchievementStatsRepairsForTest();
    const repaired = await getAchievementLeaderboardContext({
      family: 'HABIT_ORGANIZE_GAME',
      viewerUserId: userIds[0]!,
      currentCityId: cityId,
      gender: null,
    });
    assert.equal(repaired.total, 0);
    const remainingStale = await prisma.userAchievementStats.count({
      where: {
        userId: { in: userIds },
        organizeRefreshedAt: null,
      },
    });
    assert.equal(
      remainingStale,
      0,
      'background repair must advance across multiple bounded batches and finish',
    );

    const failingUserId = userIds[0]!;
    const peerUserId = userIds[1]!;
    await invalidateAchievementStatsCache({
      userIds: [failingUserId, peerUserId],
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await repairOneAchievementStatsBatchForTest({
        kind: 'organize',
        currentCityId: cityId,
        gender: null,
        refreshUser: async ({ userId }) => {
          if (userId === failingUserId) {
            const startedRevision =
              await beginAchievementStatsRefresh(userId);
            throw new AchievementStatsRefreshError(
              startedRevision,
              new Error('injected worker failure'),
            );
          }
          await refreshOrganizeHabitCounters(userId);
        },
      });
    }
    const peerStats = await prisma.userAchievementStats.findUniqueOrThrow({
      where: { userId: peerUserId },
    });
    assert.notEqual(
      peerStats.organizeRefreshedAt,
      null,
      'a failed user must not roll back a repaired peer',
    );
    const failedStats = await prisma.userAchievementStats.findUniqueOrThrow({
      where: { userId: failingUserId },
    });
    assert.equal(failedStats.organizeRepairFailures, 3);
    assert.notEqual(failedStats.organizeRepairFailedAt, null);
    await assert.rejects(
      getAchievementLeaderboardContext({
        family: 'HABIT_ORGANIZE_GAME',
        viewerUserId: failingUserId,
        currentCityId: cityId,
        gender: null,
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.statusCode === 503 &&
        error.data?.code === 'ranking.achievementStatsRepairFailed',
      'a quarantined repair must be surfaced explicitly without restarting the worker',
    );

    await prisma.userAchievementStats.update({
      where: { userId: failingUserId },
      data: {
        organizeRepairFailedAt: new Date(Date.now() - 16 * 60 * 1000),
      },
    });
    await assert.rejects(
      getAchievementLeaderboardContext({
        family: 'HABIT_ORGANIZE_GAME',
        viewerUserId: failingUserId,
        currentCityId: cityId,
        gender: null,
      }),
      (error: unknown) =>
        error instanceof ApiError &&
        error.data?.code === 'ranking.achievementStatsRefreshing',
      'an expired quarantine must automatically schedule a repair probe',
    );
    await waitForAchievementStatsRepairsForTest();
    const recovered = await prisma.userAchievementStats.findUniqueOrThrow({
      where: { userId: failingUserId },
    });
    assert.equal(recovered.organizeRepairFailures, 0);
    assert.notEqual(recovered.organizeRefreshedAt, null);
  } finally {
    await waitForAchievementStatsRepairsForTest();
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.deleteMany({ where: { id: cityId } });
  }
}

async function verifyConcurrentFinalizations(): Promise<void> {
  const cityId = `leaderboard-concurrent-city-${randomUUID()}`;
  const userId = `leaderboard-concurrent-user-${randomUUID()}`;
  const gameIds = [
    `leaderboard-concurrent-game-a-${randomUUID()}`,
    `leaderboard-concurrent-game-b-${randomUUID()}`,
  ];
  const now = new Date();

  await prisma.city.create({
    data: {
      id: cityId,
      name: 'Achievement Concurrent Finalization Test',
      country: 'Test',
      timezone: 'UTC',
    },
  });
  try {
    await prisma.user.create({
      data: {
        id: userId,
        currentCityId: cityId,
        gender: 'MALE',
      },
    });
    for (const [index, gameId] of gameIds.entries()) {
      await prisma.game.create({
        data: {
          id: gameId,
          entityType: 'GAME',
          sport: 'PADEL',
          gameType: 'CLASSIC',
          cityId,
          startTime: new Date(now.getTime() + index * 3_600_000),
          endTime: new Date(now.getTime() + (index + 1) * 3_600_000),
          resultsStatus: 'NONE',
          participants: {
            create: {
              userId,
              role: 'OWNER',
              status: 'PLAYING',
            },
          },
          outcomes: {
            create: {
              userId,
              levelBefore: 1,
              levelAfter: 1,
              levelChange: 0,
              reliabilityBefore: 0,
              reliabilityAfter: 0,
              reliabilityChange: 0,
            },
          },
        },
      });
    }
    await prisma.userAchievementStats.create({
      data: {
        userId,
        organizedGames: 0,
        organizeRefreshedAt: now,
      },
    });

    let readyCount = 0;
    let releaseBoth!: () => void;
    const bothReady = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });
    await Promise.all(
      gameIds.map((gameId) =>
        prisma.$transaction(async (tx) => {
          await tx.game.update({
            where: { id: gameId },
            data: { resultsStatus: 'FINAL' },
          });
          readyCount += 1;
          if (readyCount === gameIds.length) releaseBoth();
          await bothReady;
          await grantOrganizeAchievementsForFinalizedGame({ gameId, tx });
        }),
      ),
    );

    const stats = await prisma.userAchievementStats.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(
      stats.organizedGames,
      2,
      'concurrent finalizations must publish the complete organizer count',
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.city.deleteMany({ where: { id: cityId } });
  }
}

async function waitForDatabaseLock(processId: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE pid = ${processId}
          AND wait_event_type = 'Lock'
      ) AS waiting
    `;
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for database process lock: ${processId}`);
}

async function verifyConcurrentFinalizationAndInvalidation(): Promise<void> {
  const cityId = `leaderboard-invalidation-city-${randomUUID()}`;
  const userId = `leaderboard-invalidation-user-${randomUUID()}`;
  const priorGameId = `leaderboard-invalidation-prior-${randomUUID()}`;
  const finalizingGameId = `leaderboard-invalidation-finalizing-${randomUUID()}`;
  const now = new Date();

  await prisma.city.create({
    data: {
      id: cityId,
      name: 'Achievement Invalidation Race Test',
      country: 'Test',
      timezone: 'UTC',
    },
  });
  try {
    await prisma.user.create({
      data: {
        id: userId,
        currentCityId: cityId,
        gender: 'MALE',
      },
    });
    for (const [gameId, resultsStatus, offset] of [
      [priorGameId, 'FINAL', 0],
      [finalizingGameId, 'NONE', 1],
    ] as const) {
      await prisma.game.create({
        data: {
          id: gameId,
          entityType: 'GAME',
          sport: 'PADEL',
          gameType: 'CLASSIC',
          cityId,
          startTime: new Date(now.getTime() + offset * 3_600_000),
          endTime: new Date(now.getTime() + (offset + 1) * 3_600_000),
          resultsStatus,
          participants: {
            create: {
              userId,
              role: 'OWNER',
              status: 'PLAYING',
            },
          },
          outcomes: {
            create: {
              userId,
              levelBefore: 1,
              levelAfter: 1,
              levelChange: 0,
              reliabilityBefore: 0,
              reliabilityAfter: 0,
              reliabilityChange: 0,
            },
          },
        },
      });
    }
    await prisma.userAchievementStats.create({
      data: {
        userId,
        organizedGames: 1,
        organizeRefreshedAt: now,
      },
    });

    let invalidationReady!: () => void;
    const invalidationHasWritten = new Promise<void>((resolve) => {
      invalidationReady = resolve;
    });
    let releaseInvalidation!: () => void;
    const invalidationMayCommit = new Promise<void>((resolve) => {
      releaseInvalidation = resolve;
    });
    const invalidation = prisma.$transaction(async (tx) => {
      await tx.game.update({
        where: { id: priorGameId },
        data: { resultsStatus: 'NONE' },
      });
      await invalidateAchievementStatsCache({ userIds: [userId], tx });
      invalidationReady();
      await invalidationMayCommit;
    });

    await invalidationHasWritten;
    let reportFinalizationProcessId!: (processId: number) => void;
    const finalizationProcessId = new Promise<number>((resolve) => {
      reportFinalizationProcessId = resolve;
    });
    const finalization = prisma.$transaction(async (tx) => {
      const process = await tx.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
      reportFinalizationProcessId(process[0]!.pid);
      await tx.game.update({
        where: { id: finalizingGameId },
        data: { resultsStatus: 'FINAL' },
      });
      await grantOrganizeAchievementsForFinalizedGame({
        gameId: finalizingGameId,
        tx,
      });
    });

    await waitForDatabaseLock(await finalizationProcessId);
    releaseInvalidation();
    await Promise.all([invalidation, finalization]);

    const stats = await prisma.userAchievementStats.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(
      stats.organizedGames,
      1,
      'a simultaneous invalidation must not be overwritten by a pre-change count',
    );
    assert.notEqual(
      stats.organizeRefreshedAt,
      null,
      'the waiting finalization should publish a fresh post-invalidation count',
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.city.deleteMany({ where: { id: cityId } });
  }
}

async function main(): Promise<void> {
  let completed = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        await verifyFamilies(tx);
        await verifyTopRankBoundary(tx);
        completed = true;
        throw ROLLBACK;
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  assert.equal(completed, true);
  await verifyConcurrentFinalizations();
  await verifyConcurrentFinalizationAndInvalidation();
  await verifyBackgroundRepair();
  console.log('achievementLeaderboard.service integration: ok');
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
