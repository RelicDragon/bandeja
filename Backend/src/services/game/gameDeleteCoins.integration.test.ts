/**
 * Deleting a game must not swallow coins held against it.
 *
 * `Bet` and `GameCostShare` cascade with the game. Before the fix,
 * `GameDeleteService.deleteGame` dropped them silently: stakes already debited
 * into the bank (SOCIAL stake + accepted reward, every POOL entry) and coins a
 * player had transferred to the payer for their cost share were simply gone.
 *
 * Proven against a real database:
 *   · OPEN / ACCEPTED / NEEDS_REVIEW coin bets and POOL entries are refunded
 *     (`REFUND` from the bank) inside the delete transaction;
 *   · a share settled in coins is reversed payer → player (`TRANSFER`);
 *   · TEXT bets and MANUAL shares move nothing;
 *   · a payer who has already spent the coins blocks the delete with a 400 and
 *     leaves the game, its bets and every wallet exactly as they were;
 *   · a RESOLVED bet whose payout has not landed yet blocks the delete too.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  PriceCurrency,
  PriceType,
  ResultsStatus,
  Sport,
  TransactionType,
} from '@prisma/client';
import prisma from '../../config/database';
import { BetService } from '../bets/bet.service';
import type { BetCondition } from '../bets/betConditionEvaluator.service';
import { getGameCostSummary, markOwnShareAsPaid } from '../gameCost/gameCost.service';
import {
  getSetting,
  invalidateSettingsCache,
  PLATFORM_SETTING_KEYS,
  setSetting,
} from '../platformSetting.service';
import { ApiError } from '../../utils/ApiError';
import { GameDeleteService } from './delete.service';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const gameIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Delete coins ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const previousRate = await getSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);

  const makeUser = async (name: string, wallet: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-delcoins-${name}-${suffix}`,
        firstName: name,
        wallet,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    userIds.push(user.id);
    return user;
  };

  /** €6 split three ways: €2 = 200 coins each. */
  const makeGame = async (ownerId: string, playerIds: string[]) => {
    const startTime = new Date(Date.now() + 48 * HOURS);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        name: `Delete coins ${suffix}`,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
        resultsStatus: ResultsStatus.NONE,
        priceType: PriceType.TOTAL,
        priceTotal: 6,
        priceCurrency: PriceCurrency.EUR,
        participants: {
          create: [
            { userId: ownerId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
            ...playerIds.map((userId) => ({
              userId,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.PLAYING,
            })),
          ],
        },
      },
    });
    gameIds.push(game.id);
    return game;
  };

  const walletOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { wallet: true } }))
      .wallet;

  const condition = (entityId: string): BetCondition => ({
    type: 'CUSTOM',
    customText: `qa delete coins ${suffix}`,
    entityType: 'USER',
    entityId,
  });

  const social = (gameId: string, creatorId: string, stake: number, reward: number) =>
    BetService.createBet(
      gameId, creatorId, condition(creatorId), 'SOCIAL',
      'COINS', stake, null, 'COINS', reward, null,
    );

  const pool = (gameId: string, creatorId: string, stake: number) =>
    BetService.createBet(
      gameId, creatorId, condition(creatorId), 'POOL',
      'COINS', stake, null, 'COINS', null, null,
    );

  const expectApiError = async (fn: () => Promise<unknown>, status: number, message: string) => {
    try {
      await fn();
    } catch (error) {
      assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
      assert.equal(error.statusCode, status);
      assert.equal(error.message, message);
      return;
    }
    assert.fail(`expected ${status} ${message}`);
  };

  try {
    await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '100');

    // ── 1. Every coin held against the game comes back on delete ──────────
    const owner = await makeUser('owner', 0);
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1000);
    const game = await makeGame(owner.id, [alice.id, bob.id]);

    // SOCIAL, accepted: alice stakes 100, bob puts up the 50 reward.
    const accepted = await social(game.id, alice.id, 100, 50);
    await BetService.acceptBet(accepted.id, bob.id);
    // SOCIAL, still open: alice stakes 40.
    await social(game.id, alice.id, 40, 10);
    // SOCIAL, routed to review by a reset-results cycle: alice stakes 25.
    const review = await social(game.id, alice.id, 25, 5);
    await prisma.bet.update({ where: { id: review.id }, data: { status: 'NEEDS_REVIEW' } });
    // POOL: bob opens with 30, alice joins against with 30.
    const pooled = await pool(game.id, bob.id, 30);
    await BetService.acceptBet(pooled.id, alice.id, 'AGAINST_CREATOR');
    // TEXT stake: nothing charged, nothing to refund.
    await BetService.createBet(
      game.id, alice.id, condition(alice.id), 'SOCIAL',
      'TEXT', null, 'a beer', 'TEXT', null, 'a coffee',
    );
    // An already-cancelled bet was refunded by the cancel path — never twice.
    const cancelled = await social(game.id, bob.id, 20, 5);
    await BetService.cancelBet(cancelled.id, bob.id);

    // Cost share: alice settles 200 coins to the owner; bob only ticks "paid".
    await getGameCostSummary(game.id, alice.id);
    await markOwnShareAsPaid(game.id, alice.id, 'COINS');
    await markOwnShareAsPaid(game.id, bob.id, 'MANUAL');

    assert.equal(await walletOf(alice.id), 1000 - 100 - 40 - 25 - 30 - 200);
    assert.equal(await walletOf(bob.id), 1000 - 50 - 30);
    assert.equal(await walletOf(owner.id), 200);

    await GameDeleteService.deleteGame(game.id, owner.id);

    assert.equal(await prisma.game.count({ where: { id: game.id } }), 0, 'game is gone');
    assert.equal(await prisma.bet.count({ where: { gameId: game.id } }), 0, 'bets cascaded');
    assert.equal(await walletOf(alice.id), 1000, 'alice gets every stake and her share back');
    assert.equal(await walletOf(bob.id), 1000, 'bob gets his reward and pool entry back');
    assert.equal(await walletOf(owner.id), 0, 'the payer returns the coins they were paid');

    const refunds = await prisma.transaction.findMany({
      where: { type: TransactionType.REFUND, toUserId: { in: [alice.id, bob.id] } },
      select: { toUserId: true, total: true },
    });
    const refunded = (userId: string) =>
      refunds.filter((row) => row.toUserId === userId).map((row) => row.total).sort((a, b) => a - b);
    assert.deepEqual(refunded(alice.id), [25, 30, 40, 100], 'one REFUND per held alice stake');
    assert.deepEqual(refunded(bob.id), [20, 30, 50], 'bob: earlier cancel (20) + reward + pool');

    const reversal = await prisma.transaction.findMany({
      where: { type: TransactionType.TRANSFER, fromUserId: owner.id, toUserId: alice.id },
      select: { total: true },
    });
    assert.deepEqual(reversal.map((row) => row.total), [-200], 'share reversed as one TRANSFER');

    // ── 2. A payer who already spent the coins blocks the delete ──────────
    const spender = await makeUser('spender', 0);
    const carol = await makeUser('carol', 1000);
    const dave = await makeUser('dave', 1000);
    const blocked = await makeGame(spender.id, [carol.id, dave.id]);
    const carolBet = await social(blocked.id, carol.id, 70, 15);
    await getGameCostSummary(blocked.id, carol.id);
    await markOwnShareAsPaid(blocked.id, carol.id, 'COINS');
    await prisma.user.update({ where: { id: spender.id }, data: { wallet: 150 } });

    await expectApiError(
      () => GameDeleteService.deleteGame(blocked.id, spender.id),
      400,
      'errors.games.cannotDeleteCoinShareUnrefundable',
    );
    assert.equal(await prisma.game.count({ where: { id: blocked.id } }), 1, 'game survives');
    assert.equal(await prisma.cancelledGame.count({ where: { id: blocked.id } }), 0);
    assert.equal(
      (await prisma.bet.findUniqueOrThrow({ where: { id: carolBet.id } })).status,
      'OPEN',
      'the bet claim rolled back with the rest',
    );
    assert.equal(await walletOf(carol.id), 1000 - 70 - 200, 'no partial refund leaked out');
    assert.equal(await walletOf(spender.id), 150);

    // Once the payer can cover it again, the same delete goes through.
    await prisma.user.update({ where: { id: spender.id }, data: { wallet: 200 } });
    await GameDeleteService.deleteGame(blocked.id, spender.id);
    assert.equal(await walletOf(carol.id), 1000);
    assert.equal(await walletOf(spender.id), 0);

    // ── 3. A RESOLVED bet with an outstanding payout blocks the delete ────
    const erin = await makeUser('erin', 1000);
    const frank = await makeUser('frank', 1000);
    const pending = await makeGame(erin.id, [frank.id]);
    const unpaid = await social(pending.id, erin.id, 60, 20);
    await BetService.acceptBet(unpaid.id, frank.id);
    // Results went FINAL, the bet resolved, the payout failed, results were reset.
    await prisma.bet.update({
      where: { id: unpaid.id },
      data: { status: 'RESOLVED', winnerId: erin.id, resolvedAt: new Date(), metadata: { resolution: {} } },
    });
    await expectApiError(
      () => GameDeleteService.deleteGame(pending.id, erin.id),
      400,
      'errors.games.cannotDeletePendingBetPayout',
    );
    assert.equal(await prisma.game.count({ where: { id: pending.id } }), 1);

    // Payout landed → nothing is held any more → delete is allowed, no refund.
    await prisma.bet.update({
      where: { id: unpaid.id },
      data: { metadata: { resolution: { stakeTransferred: true, rewardTransferred: true } } },
    });
    const erinBefore = await walletOf(erin.id);
    await GameDeleteService.deleteGame(pending.id, erin.id);
    assert.equal(await walletOf(erin.id), erinBefore, 'a settled RESOLVED bet refunds nothing');

    console.log('gameDeleteCoins.integration.test.ts: ok');
  } finally {
    await prisma.gameCostShare.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.bet.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.transactionRow.deleteMany({
      where: { transaction: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] } },
    });
    await prisma.transaction.deleteMany({
      where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] },
    });
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: gameIds } } });
    await prisma.cancelledGame.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.gameParticipant.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.city.delete({ where: { id: city.id } });
    if (previousRate === null) {
      await prisma.platformSetting.deleteMany({
        where: { key: PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT },
      });
      invalidateSettingsCache();
    } else {
      await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, previousRate);
    }
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
