/**
 * PRD 348 — settling a cost share with coins, proven against a real database.
 *
 * Covers the money questions only a database can answer:
 *   · two simultaneous "Pay with coins" taps on the same share move the coins
 *     **once** — the regression: `alreadySettled` and the wallet were read
 *     outside any transaction, so both requests transferred and the second
 *     `update` orphaned the first `Transaction`;
 *   · a sequential retry after a settled share is refused;
 *   · two shares settled against one wallet that only covers one cannot
 *     overdraw it, and the loser's share is left exactly as it was found — the
 *     claim is released, never stranded as "paid" with no coins behind it;
 *   · the share points at the one transaction that actually moved coins;
 *   · un-ticking "Received" cannot release a COINS claim that is still
 *     in flight (the claim is stamped before the transfer returns);
 *   · `Game.paymentHint` — an IBAN or a payment handle — reaches the roster
 *     through `GET /games/:id` and nobody else, guests included;
 *   · and it survives the leave → broadcast → edit chain: no socket payload
 *     carries it whatever the actor's entitlement, and an update body that does
 *     not name the column leaves the saved value alone.
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
import { getGameCostSummary, getOwedSummary, markOwnShareAsPaid, setShareConfirmed, syncGameCostShares } from './gameCost.service';
import { remindUnpaidShares } from './costShareReminder.service';
import { GameReadService } from '../game/read.service';
import { GameUpdateService } from '../game/update.service';
import {
  collectGameDetailGuestContractIssues,
  projectGameForBroadcast,
} from '../game/gameDetail.projection';
import {
  getSetting,
  invalidateSettingsCache,
  PLATFORM_SETTING_KEYS,
  setSetting,
} from '../platformSetting.service';
import { ApiError } from '../../utils/ApiError';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const gameIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Cost settle ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const previousRate = await getSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);

  const makeUser = async (name: string, wallet: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-cost-${name}-${suffix}`,
        firstName: name,
        wallet,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    userIds.push(user.id);
    return user;
  };

  /** A €4 game split between the payer and one other player: €2 = 200 coins each. */
  const makeGame = async (payerUserId: string, playerUserId: string) => {
    const startTime = new Date(Date.now() - 20 * HOURS);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 2,
        // `validateGameForSport` pins roster size to the match format, and the
        // column defaults to 4 — a raw `create` bypasses that check, so the
        // first real `updateGame` would fail on a fixture we built ourselves.
        playersPerMatch: 2,
        resultsStatus: ResultsStatus.NONE,
        priceType: PriceType.TOTAL,
        priceTotal: 4,
        priceCurrency: PriceCurrency.EUR,
        participants: {
          create: [
            {
              userId: payerUserId,
              role: ParticipantRole.OWNER,
              status: ParticipantStatus.PLAYING,
            },
            {
              userId: playerUserId,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.PLAYING,
            },
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

  const shareOf = (gameId: string, userId: string) =>
    prisma.gameCostShare.findUniqueOrThrow({
      where: { gameId_userId: { gameId, userId } },
      select: {
        amountCents: true,
        markedPaidAt: true,
        confirmedAt: true,
        method: true,
        transactionId: true,
      },
    });

  try {
    // 100 coins per €1, so a €2 share costs 200 coins.
    await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '100');

    const payer = await makeUser('payer', 0);
    const player = await makeUser('player', 1000);
    const game = await makeGame(payer.id, player.id);

    // Materialize the ledger the way the client does (open the Cost card) so the
    // race below is only about settling, not about creating share rows.
    const summary = await getGameCostSummary(game.id, player.id);
    assert.equal(summary.available, true, 'the cost card is live for a priced game');
    assert.equal(summary.viewerShare?.amountMinor, 200, '€4 split two ways');
    assert.equal(summary.viewerCoinCost, 200, '€2 at 100 coins per € is 200 coins');

    // Access follows the current game roster, even when old shares exist.
    const accessGame = await makeGame(payer.id, player.id);
    await prisma.game.update({ where: { id: accessGame.id }, data: { entityType: EntityType.LEAGUE } });
    assert.equal((await getGameCostSummary(accessGame.id, player.id)).available, true);
    const staff = await makeUser('staff', 0);
    await prisma.user.update({ where: { id: staff.id }, data: { isAdmin: true } });
    assert.equal((await getGameCostSummary(accessGame.id, staff.id)).available, true);
    const denied = (error: unknown) => error instanceof ApiError && error.statusCode === 403;
    const missing = (error: unknown) => error instanceof ApiError && error.statusCode === 404;
    for (const status of [ParticipantStatus.IN_QUEUE, ParticipantStatus.INVITED, ParticipantStatus.GUEST, ParticipantStatus.NON_PLAYING]) {
      await prisma.gameParticipant.update({
        where: { userId_gameId: { gameId: accessGame.id, userId: player.id } },
        data: { status },
      });
      await assert.rejects(() => getGameCostSummary(accessGame.id, player.id), denied);
      assert.ok(await prisma.gameCostShare.findUnique({
        where: { gameId_userId: { gameId: accessGame.id, userId: player.id } },
      }), 'a rejected read must not sync or delete the old share');
      assert.equal((await getOwedSummary(player.id)).owed.some((row) => row.gameId === accessGame.id), false);
    }
    await assert.rejects(() => markOwnShareAsPaid(accessGame.id, player.id, 'MANUAL'), denied);
    await prisma.gameParticipant.update({
      where: { userId_gameId: { gameId: accessGame.id, userId: player.id } },
      data: { role: ParticipantRole.ADMIN },
    });
    assert.equal((await getGameCostSummary(accessGame.id, player.id)).available, true, 'non-playing game admin');
    await prisma.gameParticipant.update({
      where: { userId_gameId: { gameId: accessGame.id, userId: payer.id } },
      data: { status: ParticipantStatus.NON_PLAYING },
    });
    assert.equal((await getGameCostSummary(accessGame.id, payer.id)).available, true, 'non-playing owner');

    await prisma.gameParticipant.update({
      where: { userId_gameId: { gameId: accessGame.id, userId: player.id } },
      data: { status: ParticipantStatus.PLAYING },
    });
    await getGameCostSummary(accessGame.id, player.id);
    assert.equal((await getOwedSummary(payer.id)).owedToMe.some((row) => row.gameId === accessGame.id), true);

    // Even existing season shares cannot be read, settled, reminded or surfaced in Wallet.
    await prisma.game.update({ where: { id: accessGame.id }, data: { entityType: EntityType.LEAGUE_SEASON } });
    for (const actorId of [payer.id, player.id, staff.id]) {
      await assert.rejects(() => getGameCostSummary(accessGame.id, actorId), missing);
      await assert.rejects(() => remindUnpaidShares(accessGame.id, actorId), missing);
    }
    assert.equal(await syncGameCostShares(accessGame.id), null);
    assert.equal((await getOwedSummary(payer.id)).owedToMe.some((row) => row.gameId === accessGame.id), false);
    const emptySeason = await makeGame(payer.id, player.id);
    await prisma.game.update({ where: { id: emptySeason.id }, data: { entityType: EntityType.LEAGUE_SEASON } });
    assert.equal(await syncGameCostShares(emptySeason.id), null);
    assert.equal(await prisma.gameCostShare.count({ where: { gameId: emptySeason.id } }), 0);

    // --- 1. a double tap pays once -----------------------------------------
    const taps = await Promise.allSettled([
      markOwnShareAsPaid(game.id, player.id, 'COINS'),
      markOwnShareAsPaid(game.id, player.id, 'COINS'),
    ]);
    const settled = taps.filter((result) => result.status === 'fulfilled');
    const refused = taps.filter((result) => result.status === 'rejected');
    assert.equal(settled.length, 1, 'exactly one of two simultaneous taps may settle');
    assert.equal(refused.length, 1);
    const refusal = (refused[0] as PromiseRejectedResult).reason;
    assert.ok(
      refusal instanceof ApiError && refusal.statusCode === 400,
      'the loser is refused, not crashed',
    );

    assert.equal(await walletOf(player.id), 800, 'the payer of the share is debited once');
    assert.equal(await walletOf(payer.id), 200, 'the person owed the money is credited once');

    const transfers = await prisma.transaction.findMany({
      where: { type: TransactionType.TRANSFER, fromUserId: player.id, toUserId: payer.id },
      select: { id: true, total: true },
    });
    assert.equal(transfers.length, 1, 'one settled share means one TRANSFER, never two');
    assert.equal(transfers[0].total, -200, 'TRANSFER totals are negated');

    const settledShare = await shareOf(game.id, player.id);
    assert.equal(settledShare.method, 'COINS');
    assert.ok(settledShare.confirmedAt, 'a coin settlement confirms itself');
    assert.equal(
      settledShare.transactionId,
      transfers[0].id,
      'the share points at the transaction that actually moved the coins',
    );

    // --- 2. a sequential retry is refused ----------------------------------
    await assert.rejects(
      () => markOwnShareAsPaid(game.id, player.id, 'COINS'),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    );
    assert.equal(await walletOf(player.id), 800, 'a refused retry spends nothing');
    assert.equal(
      await prisma.transaction.count({
        where: { type: TransactionType.TRANSFER, fromUserId: player.id },
      }),
      1,
    );

    // --- 3. two shares, one wallet: no overdraw, and the loser's claim is
    //        released rather than left stranded --------------------------------
    // 300 coins against two 200-coin shares. Whichever settle loses must leave
    // its share exactly as it found it, because no coins moved for it.
    const payerOne = await makeUser('payerOne', 0);
    const payerTwo = await makeUser('payerTwo', 0);
    const tight = await makeUser('tight', 300);
    const gameOne = await makeGame(payerOne.id, tight.id);
    const gameTwo = await makeGame(payerTwo.id, tight.id);
    await getGameCostSummary(gameOne.id, tight.id);
    await getGameCostSummary(gameTwo.id, tight.id);

    const both = await Promise.allSettled([
      markOwnShareAsPaid(gameOne.id, tight.id, 'COINS'),
      markOwnShareAsPaid(gameTwo.id, tight.id, 'COINS'),
    ]);
    assert.equal(
      both.filter((result) => result.status === 'fulfilled').length,
      1,
      'only one 200-coin share fits in a 300-coin wallet',
    );
    const overdrawRefusal = (both.find((result) => result.status === 'rejected') as
      | PromiseRejectedResult
      | undefined)?.reason;
    assert.ok(
      overdrawRefusal instanceof ApiError && overdrawRefusal.statusCode === 400,
      'the loser is refused, not crashed',
    );
    assert.equal(await walletOf(tight.id), 100, 'the wallet never goes negative');

    const [shareOne, shareTwo] = await Promise.all([
      shareOf(gameOne.id, tight.id),
      shareOf(gameTwo.id, tight.id),
    ]);
    const unpaidGameId = shareOne.transactionId == null ? gameOne.id : gameTwo.id;
    const unpaid = shareOne.transactionId == null ? shareOne : shareTwo;
    assert.equal(unpaid.confirmedAt, null, 'an unpaid share is never left confirmed');
    assert.equal(unpaid.markedPaidAt, null, 'and never left marked paid');
    assert.equal(
      await prisma.transaction.count({
        where: { type: TransactionType.TRANSFER, fromUserId: tight.id },
      }),
      1,
      'one debit, one transaction',
    );

    // The claim was genuinely released: the share still settles once funded.
    await prisma.user.update({ where: { id: tight.id }, data: { wallet: 300 } });
    await markOwnShareAsPaid(unpaidGameId, tight.id, 'COINS');
    const recovered = await shareOf(unpaidGameId, tight.id);
    assert.ok(recovered.transactionId, 'the retry settles once funded');
    assert.equal(await walletOf(tight.id), 100);
    assert.equal(await walletOf(payerOne.id), 200, 'each payer is paid exactly once');
    assert.equal(await walletOf(payerTwo.id), 200);

    // -----------------------------------------------------------------------
    // "Received" must not release an in-flight COINS claim
    //
    // `settleOwnShareWithCoins` stamps `confirmedAt = claimedAt, method = COINS`
    // and writes `transactionId` only once `createGuardedTransfer` returns. The
    // state below is exactly that window. An unconditional `update` here used
    // to null `confirmedAt`, so the claimant's own stamp matched 0 rows, the
    // share read unsettled with both fields null, and the next "Pay with
    // coins" transferred a second time for one share.
    // -----------------------------------------------------------------------
    const inflightPayer = await makeUser('inflightpayer', 0);
    const inflightPlayer = await makeUser('inflightplayer', 500);
    const inflightGame = await makeGame(inflightPayer.id, inflightPlayer.id);
    await getGameCostSummary(inflightGame.id, inflightPayer.id);

    const claimedAt = new Date();
    await prisma.gameCostShare.update({
      where: { gameId_userId: { gameId: inflightGame.id, userId: inflightPlayer.id } },
      data: { markedPaidAt: claimedAt, confirmedAt: claimedAt, method: 'COINS', transactionId: null },
    });

    let released: ApiError | null = null;
    try {
      await setShareConfirmed(inflightGame.id, inflightPayer.id, inflightPlayer.id, false);
    } catch (error) {
      released = error instanceof ApiError ? error : null;
      if (!released) throw error;
    }
    assert.ok(released, 'un-ticking an in-flight coins claim is refused, not silently applied');
    assert.equal(released.statusCode, 400);
    assert.equal(released.message, 'errors.cost.alreadySettled');

    const stillClaimed = await shareOf(inflightGame.id, inflightPlayer.id);
    assert.notEqual(
      stillClaimed.confirmedAt,
      null,
      'the claim survives — the coin path owns this row until it stamps',
    );
    assert.equal(stillClaimed.method, 'COINS');

    // A plain MANUAL share still un-ticks exactly as before.
    await prisma.gameCostShare.update({
      where: { gameId_userId: { gameId: inflightGame.id, userId: inflightPlayer.id } },
      data: { method: 'MANUAL' },
    });
    await setShareConfirmed(inflightGame.id, inflightPayer.id, inflightPlayer.id, false);
    assert.equal(
      (await shareOf(inflightGame.id, inflightPlayer.id)).confirmedAt,
      null,
      'the ordinary un-tick is untouched',
    );

    // -----------------------------------------------------------------------
    // `Game.paymentHint` on `GET /games/:id`
    //
    // The route is `optionalAuth` and used to run a top-level Prisma `include`,
    // so every `Game` scalar — the organizer's IBAN among them — was returned
    // to a caller with no `Authorization` header at all.
    // -----------------------------------------------------------------------
    const hintPayer = await makeUser('hintpayer', 0);
    const hintPlayer = await makeUser('hintplayer', 0);
    const outsider = await makeUser('hintoutsider', 0);
    const hintGame = await makeGame(hintPayer.id, hintPlayer.id);
    const prenesiHandle = `+381-${suffix}`;
    const hintValue = `IPS Prenesi ${prenesiHandle}`;
    await prisma.game.update({
      where: { id: hintGame.id },
      data: {
        paymentHint: hintValue,
        paymentMethods: [{ method: 'IPS_PRENESI', handle: prenesiHandle }],
      },
    });

    const guestView = (await GameReadService.getGameById(hintGame.id)) as Record<string, unknown>;
    assert.equal(
      'paymentHint' in guestView,
      false,
      'an unauthenticated caller never receives the payment handle',
    );
    assert.equal(
      'paymentMethods' in guestView,
      false,
      'nor the structured list the handle now lives in',
    );
    assert.deepEqual(
      collectGameDetailGuestContractIssues(guestView),
      [],
      'and the rest of the guest payload holds the whitelist contract',
    );

    const outsiderView = (await GameReadService.getGameById(
      hintGame.id,
      outsider.id,
    )) as Record<string, unknown>;
    assert.equal(
      'paymentHint' in outsiderView,
      false,
      'a signed-in stranger is not entitled to the cost ledger either',
    );
    assert.equal('paymentMethods' in outsiderView, false);

    const memberView = (await GameReadService.getGameById(
      hintGame.id,
      hintPlayer.id,
    )) as Record<string, unknown>;
    assert.equal(
      memberView.paymentHint,
      hintValue,
      'a roster member still gets the handle they have to pay to',
    );
    assert.deepEqual(
      memberView.paymentMethods,
      [{ method: 'IPS_PRENESI', handle: prenesiHandle }],
      'and the structured list the settle sheet renders',
    );

    const payerView = (await GameReadService.getGameById(
      hintGame.id,
      hintPayer.id,
    )) as Record<string, unknown>;
    assert.equal(payerView.paymentHint, hintValue, 'and so does the organizer who typed it');

    // -----------------------------------------------------------------------
    // A player leaves → the broadcast → the organizer's next save
    //
    // The regression this covers: `leaveGame` deletes the leaver's roster row
    // and *then* emits `game-updated` with a game projected for that same
    // (now unrostered) actor, so the payload had no `paymentHint`; the room —
    // organizer included — replaced its game object with it; and the edit modal
    // wrote the missing field back as `null`, deleting the IBAN from the
    // database on an unrelated save.
    // -----------------------------------------------------------------------
    await prisma.gameParticipant.deleteMany({
      where: { gameId: hintGame.id, userId: hintPlayer.id },
    });

    // 1. The payload `ParticipantMessageHelper.emitGameUpdate` builds for the
    //    leaver indeed has no hint — that half of the chain is intact and
    //    correct: he is no longer entitled.
    const leaverView = (await GameReadService.getGameById(
      hintGame.id,
      hintPlayer.id,
    )) as Record<string, unknown>;
    assert.equal(
      'paymentHint' in leaverView,
      false,
      'the leaver is unrostered the instant his row is gone, so he gets no handle',
    );

    // 2. Whoever the actor is, the broadcast copy carries no hint. Projected
    //    from the *organizer's* entitled view — the `update.service.ts` shape,
    //    which really did put the IBAN on the wire for the whole room.
    const organizerBroadcast = projectGameForBroadcast(payerView);
    assert.equal(
      'paymentHint' in organizerBroadcast,
      false,
      'no socket recipient ever receives the payment handle, however entitled the actor',
    );
    assert.equal('paymentMethods' in organizerBroadcast, false, 'nor the structured list');
    assert.equal(
      'userNote' in organizerBroadcast || 'isClubFavorite' in organizerBroadcast,
      false,
      'nor the actor viewer-scoped fields',
    );
    assert.equal(organizerBroadcast.id, hintGame.id, 'it is still the whole game otherwise');

    // 3. The organizer edits something unrelated. Her client no longer sends
    //    `paymentHint` (it was never transmitted), and an update body that does
    //    not name the column leaves it alone.
    await GameUpdateService.updateGame(
      hintGame.id,
      { priceType: PriceType.TOTAL, priceTotal: 6, priceCurrency: PriceCurrency.EUR },
      hintPayer.id,
      false,
    );
    assert.equal(
      (
        await prisma.game.findUniqueOrThrow({
          where: { id: hintGame.id },
          select: { paymentHint: true, priceTotal: true },
        })
      ).paymentHint,
      hintValue,
      'an edit that does not touch the field preserves the saved details',
    );

    // 4. …and the write path is still live, so (3) is not vacuous: an explicit
    //    clear from the organizer does clear it.
    // 4a. A structured write replaces both columns at once — the legacy mirror
    //     can never be left describing details the organizer already changed.
    const bizumHandle = `+34600${String(Date.now()).slice(-6)}`;
    await GameUpdateService.updateGame(
      hintGame.id,
      { paymentMethods: [{ method: 'BIZUM', handle: bizumHandle }] },
      hintPayer.id,
      false,
    );
    const afterStructured = await prisma.game.findUniqueOrThrow({
      where: { id: hintGame.id },
      select: { paymentHint: true, paymentMethods: true },
    });
    assert.deepEqual(afterStructured.paymentMethods, [
      { method: 'BIZUM', handle: bizumHandle },
    ]);
    assert.equal(
      afterStructured.paymentHint,
      `Bizum ${bizumHandle}`,
      'the legacy one-line mirror is rewritten with the list, never left stale',
    );

    // 4b. …and the clear path is still live, so (3) is not vacuous.
    await GameUpdateService.updateGame(
      hintGame.id,
      { paymentMethods: null },
      hintPayer.id,
      false,
    );
    const afterClear = await prisma.game.findUniqueOrThrow({
      where: { id: hintGame.id },
      select: { paymentHint: true, paymentMethods: true },
    });
    assert.equal(afterClear.paymentHint, null, 'an explicit clear empties the mirror');
    assert.equal(afterClear.paymentMethods, null, 'and the list');

    console.log('gameCostSettle.integration.test.ts: ok');
  } finally {
    await prisma.gameCostShare.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.transactionRow.deleteMany({
      where: { transaction: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] } },
    });
    await prisma.transaction.deleteMany({
      where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] },
    });
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
