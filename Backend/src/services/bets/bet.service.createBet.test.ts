import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { ResultsStatus } from '@prisma/client';
import type { BetCondition } from './betConditionEvaluator.service';
import { createTestGame, ensureDbUrl, expectApiError } from '../../testHelpers';

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

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
    take: 1,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (users.length < 1) throw new Error('need at least 1 active user');

  const creator = users[0];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const gameId = `qa-bet-create-${suffix}`;
  const validCondition: BetCondition = {
    type: 'CUSTOM',
    customText: `qa bet ${suffix}`,
    entityType: 'USER',
    entityId: creator.id,
  };

  await createTestGame(prisma, {
    gameId,
    cityId: city.id,
    participantIds: [creator.id],
  });

  const createSocial = (
    overrides: Partial<{
      condition: BetCondition | null | undefined;
      stakeType: 'COINS' | 'TEXT';
      stakeCoins: number | null;
      stakeText: string | null;
      rewardType: 'COINS' | 'TEXT';
      rewardCoins: number | null;
      rewardText: string | null;
    }> = {}
  ) =>
    BetService.createBet(
      gameId,
      creator.id,
      'condition' in overrides ? overrides.condition : validCondition,
      'SOCIAL',
      overrides.stakeType ?? 'COINS',
      overrides.stakeCoins !== undefined ? overrides.stakeCoins : 1,
      overrides.stakeText !== undefined ? overrides.stakeText : null,
      overrides.rewardType ?? 'COINS',
      overrides.rewardCoins !== undefined ? overrides.rewardCoins : 1,
      overrides.rewardText !== undefined ? overrides.rewardText : null
    );

  const createPool = (
    overrides: Partial<{
      condition: BetCondition | null | undefined;
      stakeType: 'COINS' | 'TEXT';
      stakeCoins: number | null;
      stakeText: string | null;
    }> = {}
  ) =>
    BetService.createBet(
      gameId,
      creator.id,
      'condition' in overrides ? overrides.condition : validCondition,
      'POOL',
      overrides.stakeType ?? 'COINS',
      overrides.stakeCoins !== undefined ? overrides.stakeCoins : 1,
      overrides.stakeText !== undefined ? overrides.stakeText : null,
      'COINS',
      null,
      null
    );

  try {
    await expectApiError(
      () => createSocial({ condition: undefined }),
      400,
      'Missing required fields'
    );
    await expectApiError(
      () => createSocial({ condition: null }),
      400,
      'Missing required fields'
    );

    await expectApiError(
      () => createSocial({ stakeCoins: 0 }),
      400,
      'Stake coins must be greater than 0'
    );
    await expectApiError(
      () => createPool({ stakeCoins: -1 }),
      400,
      'Stake coins must be greater than 0'
    );

    await expectApiError(
      () => createSocial({ stakeType: 'TEXT', stakeText: null }),
      400,
      'Stake text is required'
    );
    await expectApiError(
      () => createPool({ stakeType: 'TEXT', stakeText: '' }),
      400,
      'Stake text is required'
    );

    await expectApiError(
      () => createSocial({ rewardCoins: 0 }),
      400,
      'Reward coins must be greater than 0'
    );

    await expectApiError(
      () => createSocial({ rewardType: 'TEXT', rewardText: null }),
      400,
      'Reward text is required'
    );

    await prisma.game.update({
      where: { id: gameId },
      data: { resultsStatus: ResultsStatus.IN_PROGRESS },
    });
    await expectApiError(
      () => createSocial(),
      400,
      'Cannot create bets after results entry has started'
    );
    await prisma.game.update({
      where: { id: gameId },
      data: { resultsStatus: ResultsStatus.NONE },
    });

    const socialBet = await createSocial();
    assert.equal(socialBet.type, 'SOCIAL');
    await prisma.bet.delete({ where: { id: socialBet.id } });

    const poolBet = await createPool();
    assert.equal(poolBet.type, 'POOL');
    await prisma.bet.delete({ where: { id: poolBet.id } });
  } finally {
    await prisma.game.delete({ where: { id: gameId } }).catch(() => {});
  }

  console.log('bet.service.createBet.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
