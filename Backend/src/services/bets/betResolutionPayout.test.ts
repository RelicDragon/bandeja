import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import {
  buildPoolPayoutPayload,
  buildSocialPayoutPayload,
  executeResolvedBetPayout,
  executeResolvedPoolBetPayout,
  poolBetNeedsPayout,
  reconcileUnresolvedBetPayouts,
  resetBetPayoutTestDeps,
  retryBetPayout,
  setBetPayoutTestDeps,
  socialBetNeedsPayout,
} from './betResolutionPayout.service';
import { distributePoolCoins, totalDistributedShares } from './poolCoinDistribution';

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

async function runPureTests() {
  assert.equal(
    socialBetNeedsPayout({
      stakeType: 'COINS',
      stakeCoins: 50,
      rewardType: 'TEXT',
      rewardCoins: null,
      metadata: { resolution: { stakeTransferred: false, rewardTransferred: false } },
    }),
    true,
  );
  assert.equal(
    socialBetNeedsPayout({
      stakeType: 'COINS',
      stakeCoins: 50,
      rewardType: 'COINS',
      rewardCoins: 10,
      metadata: { resolution: { stakeTransferred: true, rewardTransferred: true } },
    }),
    false,
  );

  assert.equal(
    poolBetNeedsPayout(
      {
        stakeCoins: 10,
        metadata: {
          resolution: {
            winnerIds: ['w1', 'w2'],
            winnerShares: { w1: 51, w2: 50 },
            payoutsByUser: { w1: true, w2: false },
          },
        },
      },
      ['w1', 'w2', 'l1'],
    ),
    true,
  );
  assert.equal(
    poolBetNeedsPayout(
      {
        stakeCoins: 10,
        metadata: {
          resolution: {
            winnerIds: ['w1'],
            winnerShares: { w1: 100 },
            payoutsByUser: { w1: true },
          },
        },
      },
      ['w1'],
    ),
    false,
  );

  const socialPayload = buildSocialPayoutPayload({
    id: 'b1',
    gameId: 'g1',
    creatorId: 'c1',
    acceptedBy: 'a1',
    winnerId: 'a1',
    stakeType: 'COINS',
    stakeCoins: 40,
    rewardType: 'COINS',
    rewardCoins: 10,
  });
  assert.ok(socialPayload);
  assert.equal(socialPayload!.winnerId, 'a1');
  assert.equal(socialPayload!.loserId, 'c1');

  const poolPayload = buildPoolPayoutPayload({
    id: 'p1',
    gameId: 'g1',
    metadata: {
      resolution: {
        winnerIds: ['w1'],
        poolTotalCoins: 100,
        sharePerWinner: 100,
        winnerShares: { w1: 100 },
      },
    },
  });
  assert.ok(poolPayload);
  assert.equal(poolPayload!.winnerShares.w1, 100);

  {
    const winnerIds = ['u-c', 'u-a', 'u-b'];
    const { sharePerWinner, winnerShares } = distributePoolCoins(10, winnerIds);
    const remainderPayload = buildPoolPayoutPayload({
      id: 'p-rem',
      gameId: 'g1',
      metadata: {
        resolution: { winnerIds, poolTotalCoins: 10, sharePerWinner, winnerShares },
      },
    });
    assert.ok(remainderPayload);
    assert.equal(totalDistributedShares(remainderPayload!.winnerShares), 10);
    assert.equal(remainderPayload!.winnerShares['u-a'], 4);
    assert.equal(remainderPayload!.winnerShares['u-b'], 3);
    assert.equal(remainderPayload!.winnerShares['u-c'], 3);
    assert.equal(remainderPayload!.sharePerWinner, 3);
  }

  console.log('ok: betResolutionPayout pure');
}

async function runDbIntegration() {
  const { default: prisma } = await import('../../config/database');
  const users = await prisma.user.findMany({ where: { isAdmin: false }, take: 3, select: { id: true } });
  if (users.length < 2) throw new Error('need at least 2 users');

  const city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) throw new Error('need a city');

  const suffix = Date.now();
  const gameId = `qa-bet-payout-${suffix}`;
  const socialBetId = `qa-social-bet-${suffix}`;
  const poolBetId = `qa-pool-bet-${suffix}`;
  const creator = users[0];
  const acceptor = users[1];
  const poolWinner = users[2] ?? users[1];

  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);

  await prisma.game.create({
    data: {
      id: gameId,
      entityType: 'GAME',
      gameType: 'CLASSIC',
      cityId: city.id,
      startTime: start,
      endTime: end,
      timeIsSet: true,
      status: 'FINISHED',
      resultsStatus: 'FINAL',
      finishedDate: new Date(),
    },
  });

  await prisma.bet.create({
    data: {
      id: socialBetId,
      gameId,
      creatorId: creator.id,
      acceptedBy: acceptor.id,
      acceptedAt: new Date(),
      type: 'SOCIAL',
      status: 'RESOLVED',
      resolvedAt: new Date(),
      winnerId: acceptor.id,
      stakeType: 'COINS',
      stakeCoins: 25,
      rewardType: 'COINS',
      rewardCoins: 5,
      condition: { type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: acceptor.id },
      metadata: {
        resolution: {
          stakeTransferred: false,
          rewardTransferred: false,
          resolvedAt: new Date().toISOString(),
        },
      },
    },
  });

  let socialTxCalls = 0;
  let poolTxCalls = 0;
  let failSocialStakeOnce = true;
  let failPoolPayoutOnce = true;

  setBetPayoutTestDeps({
    createTransaction: async (input) => {
      const rowTotal = input.transactionRows[0]?.total ?? 0;
      if (input.toUserId === acceptor.id && (rowTotal === 25 || rowTotal === 5)) {
        socialTxCalls++;
        if (rowTotal === 25 && failSocialStakeOnce) {
          failSocialStakeOnce = false;
          throw new Error('simulated stake transfer failure');
        }
      }
      if (input.toUserId === poolWinner.id && rowTotal === 100) {
        poolTxCalls++;
        if (failPoolPayoutOnce) {
          failPoolPayoutOnce = false;
          throw new Error('simulated pool payout failure');
        }
      }
      return { id: `mock-tx-${socialTxCalls + poolTxCalls}` } as Awaited<ReturnType<typeof import('../transaction.service').TransactionService.createTransaction>>;
    },
    sendBetResolvedNotification: async () => {},
  });

  try {
    const socialPayload = buildSocialPayoutPayload(
      (await prisma.bet.findUnique({ where: { id: socialBetId } }))!,
    );
    assert.ok(socialPayload);

    await assert.rejects(
      () => executeResolvedBetPayout(socialPayload!),
      /simulated stake transfer failure/,
    );

    let meta = (await prisma.bet.findUnique({ where: { id: socialBetId }, select: { metadata: true } }))!.metadata as {
      resolution: { stakeTransferred?: boolean; rewardTransferred?: boolean; lastPayoutError?: string };
    };
    assert.equal(meta.resolution.stakeTransferred, false);
    assert.equal(meta.resolution.rewardTransferred, false);
    assert.match(meta.resolution.lastPayoutError ?? '', /simulated stake transfer failure/);

    const reconcileAfterFailure = await reconcileUnresolvedBetPayouts();
    assert.equal(reconcileAfterFailure.retried, 1);
    assert.equal(reconcileAfterFailure.failed, 0);
    meta = (await prisma.bet.findUnique({ where: { id: socialBetId }, select: { metadata: true } }))!.metadata as {
      resolution: { stakeTransferred?: boolean; rewardTransferred?: boolean };
    };
    assert.equal(meta.resolution.stakeTransferred, true);
    assert.equal(meta.resolution.rewardTransferred, true);

    assert.equal(socialTxCalls, 3);

    await prisma.bet.create({
      data: {
        id: poolBetId,
        gameId,
        creatorId: creator.id,
        type: 'POOL',
        status: 'RESOLVED',
        resolvedAt: new Date(),
        stakeType: 'COINS',
        stakeCoins: 20,
        poolTotalCoins: 100,
        condition: { type: 'PREDEFINED', predefined: 'WIN_GAME', entityType: 'USER', entityId: creator.id },
        metadata: {
          resolution: {
            winnerIds: [poolWinner.id],
            poolTotalCoins: 100,
            sharePerWinner: 100,
            winnerShares: { [poolWinner.id]: 100 },
            payoutsByUser: { [poolWinner.id]: false },
          },
        },
        participants: {
          create: [
            { userId: creator.id, side: 'WITH_CREATOR' },
            { userId: poolWinner.id, side: 'WITH_CREATOR' },
            { userId: acceptor.id, side: 'AGAINST_CREATOR' },
          ],
        },
      },
    });

    const poolPayload = buildPoolPayoutPayload(
      (await prisma.bet.findUnique({ where: { id: poolBetId } }))!,
    );
    assert.ok(poolPayload);

    await assert.rejects(
      () => executeResolvedPoolBetPayout(poolPayload!),
      /simulated pool payout failure/,
    );

    let poolMeta = (await prisma.bet.findUnique({ where: { id: poolBetId }, select: { metadata: true } }))!.metadata as {
      resolution: { payoutsByUser?: Record<string, boolean>; lastPayoutError?: string };
    };
    assert.equal(poolMeta.resolution.payoutsByUser?.[poolWinner.id], false);
    assert.match(poolMeta.resolution.lastPayoutError ?? '', /simulated pool payout failure/);

    assert.equal(await retryBetPayout(poolBetId), true);
    poolMeta = (await prisma.bet.findUnique({ where: { id: poolBetId }, select: { metadata: true } }))!.metadata as {
      resolution: { payoutsByUser?: Record<string, boolean> };
    };
    assert.equal(poolMeta.resolution.payoutsByUser?.[poolWinner.id], true);
    assert.equal(poolTxCalls, 2);

    await executeResolvedPoolBetPayout(poolPayload!);
    assert.equal(poolTxCalls, 2);

    assert.equal(await retryBetPayout(socialBetId), false);
    assert.equal(await retryBetPayout(poolBetId), false);

    const { retried, failed } = await reconcileUnresolvedBetPayouts();
    assert.equal(retried, 0);
    assert.equal(failed, 0);
    assert.equal(
      socialBetNeedsPayout((await prisma.bet.findUnique({ where: { id: socialBetId } }))!),
      false,
    );
    assert.equal(
      poolBetNeedsPayout(
        (await prisma.bet.findUnique({ where: { id: poolBetId } }))!,
        [creator.id, poolWinner.id, acceptor.id],
      ),
      false,
    );
  } finally {
    resetBetPayoutTestDeps();
    await prisma.betParticipant.deleteMany({ where: { betId: poolBetId } });
    await prisma.bet.deleteMany({ where: { id: { in: [socialBetId, poolBetId] } } });
    await prisma.game.delete({ where: { id: gameId } });
  }

  console.log('ok: betResolutionPayout integration');
}

async function run() {
  await runPureTests();
  if (ensureDbUrl()) {
    await runDbIntegration();
  } else {
    console.log('skip: betResolutionPayout integration (no DB_URL)');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
