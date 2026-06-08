import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { TransactionType } from '@prisma/client';
import {
  createTestBet,
  createTestGame,
  createTestUser,
  ensureDbUrl,
} from '../../testHelpers';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

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
  const creator = await createTestUser(prisma, 'bet-cancel', `c-${suffix}`, 500);
  const joiner = await createTestUser(prisma, 'bet-cancel', `j-${suffix}`, 500);
  const conditionUser = await createTestUser(prisma, 'bet-cancel', `u-${suffix}`, 100);
  const gameId = `qa-bet-cancel-${suffix}`;

  await createTestGame(prisma, {
    gameId,
    cityId: city.id,
    participantIds: [creator.id, joiner.id, conditionUser.id],
  });

  const cond = condition(conditionUser.id);

  try {
    {
      const since = new Date();
      const social = await createTestBet({
        gameId,
        creatorId: creator.id,
        condition: cond,
        type: 'SOCIAL',
        stakeCoins: STAKE,
        rewardCoins: STAKE,
      });
      await BetService.cancelBet(social.id, creator.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
    }

    {
      const since = new Date();
      const pool = await createTestBet({
        gameId,
        creatorId: creator.id,
        condition: cond,
        type: 'POOL',
        stakeCoins: STAKE,
        rewardCoins: 0,
      });
      await BetService.cancelBet(pool.id, creator.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
    }

    {
      const since = new Date();
      const pool = await createTestBet({
        gameId,
        creatorId: creator.id,
        condition: cond,
        type: 'POOL',
        stakeCoins: STAKE,
        rewardCoins: 0,
      });
      await BetService.acceptBet(pool.id, joiner.id, 'AGAINST_CREATOR');
      await BetService.cancelBet(pool.id, creator.id);
      const stats = await refundStats(prisma, [creator.id, joiner.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
      assert.equal(stats.get(joiner.id)?.count, 1);
      assert.equal(stats.get(joiner.id)?.total, STAKE);
    }

    {
      const since = new Date();
      const pool = await createTestBet({
        gameId,
        creatorId: creator.id,
        condition: cond,
        type: 'POOL',
        stakeCoins: STAKE,
        rewardCoins: 0,
      });
      await BetService.cancelBetsWithUserInCondition(gameId, conditionUser.id);
      const stats = await refundStats(prisma, [creator.id], since);
      assert.equal(stats.get(creator.id)?.count, 1);
      assert.equal(stats.get(creator.id)?.total, STAKE);
      const bet = await prisma.bet.findUnique({ where: { id: pool.id } });
      assert.equal(bet?.status, 'CANCELLED');
    }

    {
      const since = new Date();
      const pool = await createTestBet({
        gameId,
        creatorId: creator.id,
        condition: cond,
        type: 'POOL',
        stakeCoins: STAKE,
        rewardCoins: 0,
      });
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
