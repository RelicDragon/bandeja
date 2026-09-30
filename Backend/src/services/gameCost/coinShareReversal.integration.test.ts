/**
 * A cost share paid in coins must never vanish with its row.
 *
 * Proven against a real database:
 *   · a player who paid in coins and then leaves is refunded payer → player,
 *     exactly once even when two roster syncs race (the real leave fires one
 *     in the background, the test fires another);
 *   · a payer who has spent the coins does not lose the player's claim: the
 *     row stays, outside the tracker's counts, and the hourly retry pays it once
 *     the payer can cover it;
 *   · a substitution does not hand a coin-paid share to the substitute: the
 *     outgoing player is refunded and the substitute owes a fresh share;
 *   · removing the price refunds coin-settled shares instead of deleting them;
 *   · a coin settle racing a game delete never strands coins: whichever wins,
 *     the two wallets add up and the payment is either recorded or returned.
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
import { getGameCostSummary, markOwnShareAsPaid, syncGameCostShares } from './gameCost.service';
import { retryPendingCoinShareRefunds } from './costShareReminder.service';
import { ParticipantService } from '../game/participant.service';
import { GameDeleteService } from '../game/delete.service';
import { GameParticipantSubstitutionService } from '../game/participantSubstitution.service';
import {
  getSetting,
  invalidateSettingsCache,
  PLATFORM_SETTING_KEYS,
  setSetting,
} from '../platformSetting.service';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const gameIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Coin reversal ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const previousRate = await getSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);

  const makeUser = async (name: string, wallet: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-coinrev-${name}-${suffix}`,
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
        name: `Coin reversal ${suffix}`,
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
  const shareRow = (gameId: string, userId: string) =>
    prisma.gameCostShare.findUnique({ where: { gameId_userId: { gameId, userId } } });
  const transfersBack = (fromUserId: string, toUserId: string) =>
    prisma.transaction.count({ where: { type: TransactionType.TRANSFER, fromUserId, toUserId } });

  try {
    await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '100');

    // ── 1. Leave after paying in coins → refunded once ─────────────────────
    const owner = await makeUser('owner', 0);
    const alice = await makeUser('alice', 1000);
    const bob = await makeUser('bob', 1000);
    const game = await makeGame(owner.id, [alice.id, bob.id]);
    await getGameCostSummary(game.id, alice.id);
    await markOwnShareAsPaid(game.id, alice.id, 'COINS');
    assert.equal(await walletOf(alice.id), 800);
    assert.equal(await walletOf(owner.id), 200);

    await ParticipantService.leaveGame(game.id, alice.id);
    // leaveGame already fired a background sync; race it with two more.
    await Promise.all([syncGameCostShares(game.id), syncGameCostShares(game.id)]);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(await walletOf(alice.id), 1000, 'alice gets her 200 coins back');
    assert.equal(await walletOf(owner.id), 0, 'the payer returns them');
    assert.equal(await transfersBack(owner.id, alice.id), 1, 'exactly one reversal');
    assert.equal(await shareRow(game.id, alice.id), null, 'her share is gone');
    const bobView = await getGameCostSummary(game.id, bob.id);
    assert.equal(bobView.shareCount, 2, 'two players left in the split');

    // ── 2. Payer already spent it → claim kept, retried later ─────────────
    const spender = await makeUser('spender', 0);
    const carol = await makeUser('carol', 1000);
    const dave = await makeUser('dave', 1000);
    const short = await makeGame(spender.id, [carol.id, dave.id]);
    await getGameCostSummary(short.id, carol.id);
    await markOwnShareAsPaid(short.id, carol.id, 'COINS');
    await prisma.user.update({ where: { id: spender.id }, data: { wallet: 50 } });

    await ParticipantService.leaveGame(short.id, carol.id);
    await syncGameCostShares(short.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(await walletOf(carol.id), 800, 'nothing to refund from yet');
    assert.equal(await walletOf(spender.id), 50, 'the payer is never overdrawn');
    const kept = await shareRow(short.id, carol.id);
    assert.ok(kept?.transactionId, 'the paid share survives as the refund claim');
    const ownerView = await getGameCostSummary(short.id, spender.id);
    assert.equal(ownerView.shareCount, 2, 'a pending refund is not a share of the game');
    assert.ok(ownerView.shares.every((share) => share.userId !== carol.id));

    await prisma.user.update({ where: { id: spender.id }, data: { wallet: 230 } });
    assert.ok((await retryPendingCoinShareRefunds(500)) >= 1, 'the sweep picks the game up');
    assert.equal(await walletOf(carol.id), 1000);
    assert.equal(await walletOf(spender.id), 30);
    assert.equal(await shareRow(short.id, carol.id), null);
    assert.equal(await transfersBack(spender.id, carol.id), 1);

    // ── 3. Price removed → coin shares refunded, not dropped ──────────────
    const host = await makeUser('host', 0);
    const erin = await makeUser('erin', 1000);
    const frank = await makeUser('frank', 1000);
    const priced = await makeGame(host.id, [erin.id, frank.id]);
    await getGameCostSummary(priced.id, erin.id);
    await markOwnShareAsPaid(priced.id, erin.id, 'COINS');
    await markOwnShareAsPaid(priced.id, frank.id, 'MANUAL');
    await prisma.game.update({ where: { id: priced.id }, data: { priceTotal: null } });
    await syncGameCostShares(priced.id);
    assert.equal(await walletOf(erin.id), 1000);
    assert.equal(await walletOf(host.id), 0);
    assert.equal(await prisma.gameCostShare.count({ where: { gameId: priced.id } }), 0);

    // ── 4. Settle racing delete: coins are either recorded or returned ────
    for (let round = 0; round < 8; round += 1) {
      const payer = await makeUser(`racepayer${round}`, 0);
      const racer = await makeUser(`racer${round}`, 1000);
      const other = await makeUser(`raceother${round}`, 1000);
      const race = await makeGame(payer.id, [racer.id, other.id]);
      await getGameCostSummary(race.id, racer.id);

      await Promise.allSettled([
        markOwnShareAsPaid(race.id, racer.id, 'COINS'),
        GameDeleteService.deleteGame(race.id, payer.id),
      ]);

      const racerWallet = await walletOf(racer.id);
      const payerWallet = await walletOf(payer.id);
      assert.equal(racerWallet + payerWallet, 1000, `round ${round}: no coins created or lost`);
      const stillThere = await prisma.game.count({ where: { id: race.id } });
      if (stillThere === 0) {
        assert.equal(racerWallet, 1000, `round ${round}: deleted game returns everything`);
      } else {
        const row = await shareRow(race.id, racer.id);
        assert.equal(racerWallet === 800, row?.transactionId != null, `round ${round}: paid iff recorded`);
      }
    }

    // ── 5. Substitution: coins go back, the substitute owes a fresh share ──
    const organiser = await makeUser('organiser', 0);
    const gina = await makeUser('gina', 1000);
    const hank = await makeUser('hank', 1000);
    const ivan = await makeUser('ivan', 1000);
    const live = await makeGame(organiser.id, [gina.id, hank.id]);
    await getGameCostSummary(live.id, gina.id);
    await markOwnShareAsPaid(live.id, gina.id, 'COINS');
    await prisma.game.update({ where: { id: live.id }, data: { resultsStatus: ResultsStatus.IN_PROGRESS } });

    await GameParticipantSubstitutionService.substitute({
      gameId: live.id,
      outUserId: gina.id,
      inUserId: ivan.id,
      actorUserId: organiser.id,
    });
    await syncGameCostShares(live.id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(await walletOf(gina.id), 1000, 'the outgoing player gets her coins back');
    assert.equal(await walletOf(organiser.id), 0);
    assert.equal(await walletOf(ivan.id), 1000, 'the substitute paid nothing yet');
    assert.equal(await shareRow(live.id, gina.id), null);
    const ivanShare = await shareRow(live.id, ivan.id);
    assert.ok(ivanShare, 'the substitute has a share');
    assert.equal(ivanShare.confirmedAt, null, '…and it is unpaid');
    assert.equal(ivanShare.transactionId, null);
    assert.equal(ivanShare.amountCents, 200);

    console.log('coinShareReversal.integration.test.ts: ok');
  } finally {
    await prisma.gameCostShare.deleteMany({ where: { gameId: { in: gameIds } } });
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
