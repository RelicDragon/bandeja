import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { EntityType, GameStatus, ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import type { BetCondition } from './betConditionEvaluator.service';

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

async function expectApiError(
  fn: () => Promise<unknown>,
  statusCode: number,
  message: string
): Promise<void> {
  try {
    await fn();
    assert.fail('expected ApiError');
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    assert.equal(err.statusCode, statusCode);
    assert.equal(err.message, message);
  }
}

async function run() {
  if (!ensureDbUrl()) {
    console.log('skip: DB_URL not set');
    return;
  }

  const { default: prisma } = await import('../../config/database');
  const { BetService } = await import('./bet.service');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('no City row');

  const users = await prisma.user.findMany({
    where: { isActive: true },
    take: 4,
    select: { id: true, wallet: true },
    orderBy: { createdAt: 'asc' },
  });
  if (users.length < 3) throw new Error('need at least 3 active users');

  const [creator, acceptor, outsider] = users;
  const suffix = Date.now();
  const gameId = `qa-bet-accept-${suffix}`;
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const stakeCoins = 1;
  const condition: BetCondition = {
    type: 'CUSTOM',
    customText: `qa bet ${suffix}`,
    entityType: 'USER',
    entityId: creator.id,
  };

  const walletsBefore = new Map(users.slice(0, 3).map((u) => [u.id, u.wallet]));
  for (const u of [creator, acceptor, outsider]) {
    if (u.wallet < stakeCoins * 2) {
      await prisma.user.update({ where: { id: u.id }, data: { wallet: 1000 } });
    }
  }

  const createdBetIds: string[] = [];

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: EntityType.GAME,
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: GameStatus.ANNOUNCED,
      resultsStatus: 'NONE',
      participants: {
        create: [
          { userId: creator.id, role: ParticipantRole.OWNER, status: 'PLAYING' },
          { userId: acceptor.id, role: ParticipantRole.PARTICIPANT, status: 'PLAYING' },
        ],
      },
    },
  });

  try {
    const poolBet = await BetService.createBet(
      gameId,
      creator.id,
      condition,
      'POOL',
      'COINS',
      stakeCoins,
      null,
      'COINS',
      null,
      null
    );
    createdBetIds.push(poolBet.id);

    await expectApiError(
      () => BetService.acceptBet(poolBet.id, outsider.id, 'AGAINST_CREATOR'),
      400,
      'You are not a playing participant in this game'
    );

    await BetService.acceptBet(poolBet.id, acceptor.id, 'AGAINST_CREATOR');
    const poolParticipant = await prisma.betParticipant.findUnique({
      where: { betId_userId: { betId: poolBet.id, userId: acceptor.id } },
    });
    assert.ok(poolParticipant, 'playing participant joins pool bet');

    const socialBet = await BetService.createBet(
      gameId,
      creator.id,
      condition,
      'SOCIAL',
      'COINS',
      stakeCoins,
      null,
      'COINS',
      stakeCoins,
      null
    );
    createdBetIds.push(socialBet.id);

    await expectApiError(
      () => BetService.acceptBet(socialBet.id, outsider.id),
      400,
      'You are not a playing participant in this game'
    );

    const socialAccepted = await BetService.acceptBet(socialBet.id, acceptor.id);
    assert.equal(socialAccepted.status, 'ACCEPTED');
    assert.equal(socialAccepted.acceptedBy, acceptor.id);

    console.log('ok: pool reject non-participant');
    console.log('ok: pool accept playing participant');
    console.log('ok: social reject non-participant');
    console.log('ok: social accept playing participant');
  } finally {
    if (createdBetIds.length > 0) {
      await prisma.bet.deleteMany({ where: { id: { in: createdBetIds } } });
    }
    await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
    for (const [userId, wallet] of walletsBefore) {
      await prisma.user.update({ where: { id: userId }, data: { wallet } }).catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
