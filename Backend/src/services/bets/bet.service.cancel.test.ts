import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole, TransactionType } from '@prisma/client';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

function ensureDbUrl(): boolean {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

const STAKE = 50;
const condition = (userId: string) => ({
  type: 'PREDEFINED' as const,
  predefined: 'WIN_GAME',
  entityType: 'USER' as const,
  entityId: userId,
});

async function refundStats(
  prisma: typeof import('../../config/database').default,
  userIds: string[],
  since: Date,
) {
  const rows = await prisma.transaction.findMany({
    where: {
      type: TransactionType.REFUND,
      toUserId: { in: userIds },
      createdAt: { gte: since },
    },
    select: { toUserId: true, total: true },
  });
  const byUser = new Map<string, { count: number; total: number }>();
  for (const uid of userIds) byUser.set(uid, { count: 0, total: 0 });
  for (const row of rows) {
    if (!row.toUserId) continue;
    const cur = byUser.get(row.toUserId) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += row.total;
    byUser.set(row.toUserId, cur);
  }
  return byUser;
}

async function createTestUser(
  prisma: typeof import('../../config/database').default,
  suffix: string,
  wallet: number,
) {
  return prisma.user.create({
    data: {
      phone: `qa-bet-cancel-${suffix}`,
      email: `qa-bet-cancel-${suffix}@test.local`,
      firstName: 'QA',
      lastName: 'BetCancel',
      wallet,
      isActive: true,
    },
    select: { id: true },
  });
}

async function createTestGame(
  prisma: typeof import('../../config/database').default,
  gameId: string,
  cityId: string,
  participantIds: string[],
) {
  const start = new Date(Date.now() + 86_400_000);
  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId,
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      participants: {
        create: participantIds.map((userId, i) => ({
          userId,
          role: i === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
          status: 'PLAYING',
        })),
      },
    },
  });
}

async function run() {
  if (!ensureDbUrl()) {
    console.log('SKIP bet.service.cancel.test.ts: DB_URL not set');
    return;
  }

  const { default: prisma } = await import('../../config/database');
  const { BetService } = await import('./bet.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const suffix = `${Date.now()}`;
  const creator = await createTestUser(prisma, `c-${suffix}`, 500);
  const joiner = await createTestUser(prisma, `j-${suffix}`, 500);
  const conditionUser = await createTestUser(prisma, `u-${suffix}`, 100);
  const gameId = `qa-bet-cancel-${suffix}`;

  await createTestGame(prisma, gameId, city.id, [
    creator.id,
    joiner.id,
    conditionUser.id,
  ]);

  const cond = condition(conditionUser.id);

  try {
    // SOCIAL manual cancel: creator refunded once
    {
      const since = new Date();
      const social = await BetService.createBet(
        gameId,
        creator.id,
        cond,
        'SOCIAL',
        'COINS',
        STAKE,
        null,
        'COINS',
        STAKE,
        null,
      );
      await BetService.cancelBet(social.id, creator.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
    }

    // POOL creator-only manual cancel
    {
      const since = new Date();
      const pool = await BetService.createBet(
        gameId,
        creator.id,
        cond,
        'POOL',
        'COINS',
        STAKE,
        null,
        'COINS',
        0,
        null,
      );
      await BetService.cancelBet(pool.id, creator.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
    }

    // POOL creator + joiner manual cancel
    {
      const since = new Date();
      const pool = await BetService.createBet(
        gameId,
        creator.id,
        cond,
        'POOL',
        'COINS',
        STAKE,
        null,
        'COINS',
        0,
        null,
      );
      await BetService.acceptBet(pool.id, joiner.id, 'AGAINST_CREATOR');
      await BetService.cancelBet(pool.id, creator.id);
      const stats = await refundStats(prisma, [creator.id, joiner.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
      assert.equal(stats.get(joiner.id)?.count, 1);
      assert.equal(stats.get(joiner.id)?.total, STAKE);
    }

    // POOL creator-only auto-cancel
    {
      const since = new Date();
      const pool = await BetService.createBet(
        gameId,
        creator.id,
        cond,
        'POOL',
        'COINS',
        STAKE,
        null,
        'COINS',
        0,
        null,
      );
      await BetService.cancelBetsWithUserInCondition(gameId, conditionUser.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
      const bet = await prisma.bet.findUnique({ where: { id: pool.id } });
      assert.equal(bet?.status, 'CANCELLED');
    }

    // POOL creator + joiner auto-cancel
    {
      const since = new Date();
      const pool = await BetService.createBet(
        gameId,
        creator.id,
        cond,
        'POOL',
        'COINS',
        STAKE,
        null,
        'COINS',
        0,
        null,
      );
      await BetService.acceptBet(pool.id, joiner.id, 'WITH_CREATOR');
      await BetService.cancelBetsWithUserInCondition(gameId, conditionUser.id);
      const stats = await refundStats(prisma, [creator.id, joiner.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
      assert.equal(stats.get(joiner.id)?.count, 1);
      assert.equal(stats.get(joiner.id)?.total, STAKE);
      const bet = await prisma.bet.findUnique({ where: { id: pool.id } });
      assert.equal(bet?.status, 'CANCELLED');
    }

    console.log('bet.service.cancel.test.ts: all passed');
  } finally {
    await prisma.bet.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
    await prisma.user.deleteMany({
      where: { id: { in: [creator.id, joiner.id, conditionUser.id] } },
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
