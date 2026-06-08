import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole, ResultsStatus, TransactionType } from '@prisma/client';

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
const REWARD = 10;

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
      phone: `qa-bet-void-${suffix}`,
      email: `qa-bet-void-${suffix}@test.local`,
      firstName: 'QA',
      lastName: 'BetVoid',
      wallet,
      isActive: true,
    },
    select: { id: true },
  });
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

  const gameId = `qa-bet-void-${Date.now()}`;
  const creator = await createTestUser(prisma, `${Date.now()}-c`, 500);
  const acceptor = await createTestUser(prisma, `${Date.now()}-a`, 500);
  const joiner = await createTestUser(prisma, `${Date.now()}-j`, 500);
  const absentTarget = await createTestUser(prisma, `${Date.now()}-t`, 500);
  const playingUser = await createTestUser(prisma, `${Date.now()}-p`, 500);

  const start = new Date(Date.now() + 86_400_000);
  const cond = condition(absentTarget.id);
  let socialBetId = '';
  let poolBetId = '';

  try {
    await prisma.game.create({
      data: {
        id: gameId,
        entityType: EntityType.GAME,
        gameType: 'CLASSIC',
        cityId: city.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        timeIsSet: true,
        status: GameStatus.ANNOUNCED,
        resultsStatus: ResultsStatus.NONE,
        participants: {
          create: [creator.id, acceptor.id, joiner.id, playingUser.id, absentTarget.id].map((userId, i) => ({
            userId,
            role: i === 0 ? ParticipantRole.OWNER : ParticipantRole.PARTICIPANT,
            status: 'PLAYING',
          })),
        },
      },
    });

    const socialBet = await BetService.createBet(
      gameId,
      creator.id,
      cond,
      'SOCIAL',
      'COINS',
      STAKE,
      'Buy coffee',
      'COINS',
      REWARD,
      null,
    );
    socialBetId = socialBet.id;
    await BetService.acceptBet(socialBet.id, acceptor.id);

    const poolBet = await BetService.createBet(
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
    poolBetId = poolBet.id;
    await BetService.acceptBet(poolBet.id, joiner.id, 'AGAINST_CREATOR');

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

    let stats = await refundStats(prisma, [creator.id, acceptor.id, joiner.id], since);
    for (let i = 0; i < 20 && (stats.get(creator.id)?.count ?? 0) < 2; i += 1) {
      await new Promise(r => setTimeout(r, 100));
      stats = await refundStats(prisma, [creator.id, acceptor.id, joiner.id], since);
    }

    const socialRow = await prisma.bet.findUnique({ where: { id: socialBetId } });
    assert.equal(socialRow?.status, 'CANCELLED');
    assert.match(socialRow?.resolutionReason ?? '', /voided/i);

    const poolRow = await prisma.bet.findUnique({ where: { id: poolBetId } });
    assert.equal(poolRow?.status, 'CANCELLED');
    assert.match(poolRow?.resolutionReason ?? '', /voided/i);

    assert.equal(stats.get(creator.id)?.count, 2);
    assert.equal(stats.get(creator.id)?.total, STAKE * 2);
    assert.equal(stats.get(acceptor.id)?.count, 1);
    assert.equal(stats.get(acceptor.id)?.total, REWARD);
    assert.equal(stats.get(joiner.id)?.count, 1);
    assert.equal(stats.get(joiner.id)?.total, STAKE);

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
