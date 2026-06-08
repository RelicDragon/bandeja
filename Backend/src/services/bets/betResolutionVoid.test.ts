import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { GameStatus, ResultsStatus, TransactionType } from '@prisma/client';
import {
  createTestBet,
  createTestGame,
  createTestUser,
  ensureDbUrl,
} from '../../testHelpers';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const STAKE = 50;
const REWARD = 10;

const winGameCondition = (userId: string) => ({
  type: 'PREDEFINED' as const,
  predefined: 'WIN_GAME',
  entityType: 'USER' as const,
  entityId: userId,
});

const winSetCondition = (userId: string) => ({
  type: 'PREDEFINED' as const,
  predefined: 'WIN_SET',
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
    console.log('SKIP betResolutionVoid.test.ts: DB_URL not set');
    return;
  }

  const prisma = (await import('../../config/database')).default;
  const { BetService } = await import('./bet.service');
  const { resolveGameBets } = await import('./betResolution.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) {
    console.log('SKIP betResolutionVoid.test.ts: no city in DB');
    return;
  }

  const ts = `${Date.now()}`;
  const gameId = `qa-bet-void-${ts}`;
  const creator = await createTestUser(prisma, 'bet-void', `${ts}-c`, 500);
  const acceptor = await createTestUser(prisma, 'bet-void', `${ts}-a`, 500);
  const joiner = await createTestUser(prisma, 'bet-void', `${ts}-j`, 500);
  const absentTarget = await createTestUser(prisma, 'bet-void', `${ts}-t`, 500);
  const playingUser = await createTestUser(prisma, 'bet-void', `${ts}-p`, 500);

  const cond = winGameCondition(absentTarget.id);
  const setCond = winSetCondition(absentTarget.id);
  let socialBetId = '';
  let poolBetId = '';

  try {
    await createTestGame(prisma, {
      gameId,
      cityId: city.id,
      participantIds: [creator.id, acceptor.id, joiner.id, playingUser.id, absentTarget.id],
    });

    const socialBet = await createTestBet({
      gameId,
      creatorId: creator.id,
      condition: cond,
      type: 'SOCIAL',
      stakeCoins: STAKE,
      rewardCoins: REWARD,
      stakeText: 'Buy coffee',
    });
    socialBetId = socialBet.id;
    await BetService.acceptBet(socialBet.id, acceptor.id);

    const poolBet = await createTestBet({
      gameId,
      creatorId: creator.id,
      condition: cond,
      type: 'POOL',
      stakeCoins: STAKE,
      rewardCoins: 0,
    });
    poolBetId = poolBet.id;
    await BetService.acceptBet(poolBet.id, joiner.id, 'AGAINST_CREATOR');

    const setPool = await createTestBet({
      gameId,
      creatorId: creator.id,
      condition: setCond,
      type: 'POOL',
      stakeCoins: STAKE,
      rewardCoins: 0,
    });
    await BetService.acceptBet(setPool.id, joiner.id, 'WITH_CREATOR');

    const since = new Date();
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: GameStatus.FINISHED,
        resultsStatus: ResultsStatus.FINAL,
        outcomes: {
          create: [{
            userId: playingUser.id,
            levelBefore: 3,
            levelAfter: 3,
            levelChange: 0,
            reliabilityBefore: 0.5,
            reliabilityAfter: 0.5,
            reliabilityChange: 0,
            isWinner: true,
            wins: 1,
            losses: 0,
            ties: 0,
          }],
        },
      },
    });

    await resolveGameBets(gameId);

    const stats = await refundStats(prisma, [creator.id, acceptor.id, joiner.id], since);

    const socialRow = await prisma.bet.findUnique({ where: { id: socialBetId } });
    assert.equal(socialRow?.status, 'CANCELLED');
    assert.match(socialRow?.resolutionReason ?? '', /voided/i);

    const poolRow = await prisma.bet.findUnique({ where: { id: poolBetId } });
    assert.equal(poolRow?.status, 'CANCELLED');
    assert.match(poolRow?.resolutionReason ?? '', /voided/i);

    const setPoolRow = await prisma.bet.findUnique({ where: { id: setPool.id } });
    assert.equal(setPoolRow?.status, 'CANCELLED');
    assert.match(setPoolRow?.resolutionReason ?? '', /voided/i);

    assert.equal(stats.get(creator.id)?.count, 3);
    assert.equal(stats.get(creator.id)?.total, STAKE * 3);
    assert.equal(stats.get(acceptor.id)?.count, 1);
    assert.equal(stats.get(acceptor.id)?.total, REWARD);
    assert.equal(stats.get(joiner.id)?.count, 2);
    assert.equal(stats.get(joiner.id)?.total, STAKE * 2);

    console.log('ok: betResolutionVoid');
  } finally {
    await prisma.bet.deleteMany({ where: { gameId } });
    await prisma.gameOutcome.deleteMany({ where: { gameId } });
    await prisma.game.deleteMany({ where: { id: gameId } });
    await prisma.user.deleteMany({
      where: { id: { in: [creator.id, acceptor.id, joiner.id, absentTarget.id, playingUser.id] } },
    });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
