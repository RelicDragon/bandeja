/**
 * PRD 347 — spot-opened and queue auto-fill, proven against a real database.
 *
 * Covers the Testing Decisions that only a database can answer:
 *   · each trigger raises the event exactly once (`SpotOpenedDelivery` rows);
 *   · auto-fill promotes exactly one player, respects the level gate, and
 *     falls through to the next queued player when the first fails it;
 *   · no promotion and no notification when the roster is locked;
 *   · dedupe is per user, per game, per day, per kind;
 *   · the owner is never a recipient;
 *   · leave → queue push → the queued player can join (the `?join=1` flow
 *     calls exactly the same `ParticipantService.joinGame`);
 *   · the "Spot opened" pill clears as soon as the seat is taken again;
 *   · the by-ids enrichment endpoint answers only for games the viewer may
 *     see, so a private series name and per-head price stay private.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed, so
 * nothing leaves the process.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  GenderTeam,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  PlayIntentTimeOfDay,
  PushPlatform,
  ResultsStatus,
  Sport,
  SpotOpenedKind,
} from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import prisma from '../../config/database';
import { GameSeatService } from './gameSeat.service';
import { ParticipantService } from '../game/participant.service';
import { AdminService } from '../game/admin.service';
import { PlayIntentMatchService } from '../playIntent/playIntentMatch.service';
import { spotOpenedEnricher } from './spotOpenedEnricher';
import { enrichAvailableGamesByIds } from '../game/availableGamesEnrichment';

// Nothing must leave the process. `shouldSuppressAllOutboundNotifications`
// reads this, so `sendNotification` short-circuits to "delivered: false" —
// the `SpotOpenedDelivery` claim rows this test asserts on are written first.
process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdClubIds: string[] = [];
  const createdIntentIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Spot opened ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = async (name: string, level?: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-spot-${name}-${suffix}`,
        firstName: name,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(user.id);
    if (level !== undefined) {
      await prisma.userSportProfile.create({
        data: { userId: user.id, sport: Sport.PADEL, level },
      });
    }
    return user;
  };

  const makeGame = async (
    overrides: {
      maxParticipants?: number;
      isPublic?: boolean;
      autoFillFromQueue?: boolean;
      allowDirectJoin?: boolean;
      resultsStatus?: ResultsStatus;
      minLevel?: number | null;
      maxLevel?: number | null;
    },
    roster: { userId: string; role: ParticipantRole; status: ParticipantStatus; joinedAt?: Date }[],
  ) => {
    const startTime = new Date(Date.now() + 20 * HOURS);
    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        isPublic: overrides.isPublic ?? true,
        maxParticipants: overrides.maxParticipants ?? 4,
        autoFillFromQueue: overrides.autoFillFromQueue ?? false,
        allowDirectJoin: overrides.allowDirectJoin ?? false,
        resultsStatus: overrides.resultsStatus ?? ResultsStatus.NONE,
        minLevel: overrides.minLevel ?? null,
        maxLevel: overrides.maxLevel ?? null,
        participants: { create: roster },
      },
    });
    createdGameIds.push(game.id);
    return game;
  };

  const deliveries = (gameId: string) =>
    prisma.spotOpenedDelivery.findMany({
      where: { gameId },
      select: { userId: true, kind: true, dayKey: true },
      orderBy: { createdAt: 'asc' },
    });

  const statusOf = async (gameId: string, userId: string) =>
    (
      await prisma.gameParticipant.findFirst({
        where: { gameId, userId },
        select: { status: true },
      })
    )?.status ?? null;

  try {
    const [owner, playerA, playerB, queuedLow, queuedOk, second] = await Promise.all([
      makeUser('owner', 3.5),
      makeUser('playerA', 3.5),
      makeUser('playerB', 3.5),
      makeUser('queuedlow', 1.0),
      makeUser('queuedok', 3.5),
      makeUser('second', 3.5),
    ]);

    // -----------------------------------------------------------------------
    // 1. leave → one delivery for the queued player, never for the owner
    // -----------------------------------------------------------------------
    // `allowDirectJoin` so the queued player can take the freed seat below —
    // the manual-accept variant is covered in `joinFromQueue.integration.test`.
    const leaveGame = await makeGame({ maxParticipants: 4, allowDirectJoin: true }, [
      { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: playerB.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: queuedOk.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: second.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);

    await ParticipantService.leaveGame(leaveGame.id, playerB.id);
    // `seatOpened` is fire-and-forget; give the microtask chain room to finish.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const afterLeave = await deliveries(leaveGame.id);
    assert.deepEqual(
      afterLeave.map((d) => ({ userId: d.userId, kind: d.kind })),
      [{ userId: second.id, kind: SpotOpenedKind.QUEUE }],
      'exactly one queue delivery, and the owner is not on the list',
    );
    assert.equal(
      afterLeave.some((d) => d.userId === owner.id),
      false,
      'the owner is never told about their own game',
    );
    assert.notEqual(
      (
        await prisma.game.findUniqueOrThrow({
          where: { id: leaveGame.id },
          select: { lastSeatOpenedAt: true },
        })
      ).lastSeatOpenedAt,
      null,
      'Game.lastSeatOpenedAt is recorded',
    );

    // A second seat opening on the same day must not produce a second row.
    await ParticipantService.leaveGame(leaveGame.id, playerA.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(
      (await deliveries(leaveGame.id)).length,
      1,
      'dedupe is per user, per game, per day, per kind',
    );

    // …and the queued player can still take the seat, which is exactly what
    // the `?join=1` deep link runs.
    await ParticipantService.joinGame(leaveGame.id, second.id);
    assert.equal(await statusOf(leaveGame.id, second.id), ParticipantStatus.PLAYING);

    // -----------------------------------------------------------------------
    // 2. kick → one delivery
    // -----------------------------------------------------------------------
    const kickGame = await makeGame({ maxParticipants: 2 }, [
      { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: second.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);
    await AdminService.kickUser(kickGame.id, owner.id, playerA.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.deepEqual(
      (await deliveries(kickGame.id)).map((d) => d.userId),
      [second.id],
      'a kick raises the event exactly once',
    );

    // -----------------------------------------------------------------------
    // 3. auto-fill respects the level gate and falls through
    // -----------------------------------------------------------------------
    const autoFillGame = await makeGame(
      { maxParticipants: 2, autoFillFromQueue: true, minLevel: 3, maxLevel: 4.5 },
      [
        { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
        { userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
        {
          userId: queuedLow.id,
          role: ParticipantRole.PARTICIPANT,
          status: ParticipantStatus.IN_QUEUE,
          joinedAt: new Date(Date.now() - 2 * HOURS),
        },
        {
          userId: queuedOk.id,
          role: ParticipantRole.PARTICIPANT,
          status: ParticipantStatus.IN_QUEUE,
          joinedAt: new Date(Date.now() - 1 * HOURS),
        },
      ],
    );

    await ParticipantService.leaveGame(autoFillGame.id, playerA.id);
    await new Promise((resolve) => setTimeout(resolve, 600));

    assert.equal(
      await statusOf(autoFillGame.id, queuedLow.id),
      ParticipantStatus.IN_QUEUE,
      'the first in line fails the level gate and stays queued',
    );
    assert.equal(
      await statusOf(autoFillGame.id, queuedOk.id),
      ParticipantStatus.PLAYING,
      'auto-fill falls through to the next queued player who passes',
    );
    assert.equal(
      await prisma.gameParticipant.count({
        where: { gameId: autoFillGame.id, status: ParticipantStatus.PLAYING },
      }),
      2,
      'exactly one promotion — the roster never overfills',
    );

    // -----------------------------------------------------------------------
    // 4. locked roster: no promotion, no delivery, no timestamp
    // -----------------------------------------------------------------------
    const lockedGame = await makeGame(
      {
        maxParticipants: 4,
        autoFillFromQueue: true,
        resultsStatus: ResultsStatus.IN_PROGRESS,
      },
      [
        { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
        { userId: queuedOk.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
      ],
    );
    await GameSeatService.seatOpened(lockedGame.id, 1, 'LEAVE');
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal((await deliveries(lockedGame.id)).length, 0, 'locked rosters send nothing');
    assert.equal(
      await statusOf(lockedGame.id, queuedOk.id),
      ParticipantStatus.IN_QUEUE,
      'locked rosters are never auto-filled',
    );
    assert.equal(
      (
        await prisma.game.findUniqueOrThrow({
          where: { id: lockedGame.id },
          select: { lastSeatOpenedAt: true },
        })
      ).lastSeatOpenedAt,
      null,
      'a locked game never gets the pill timestamp',
    );

    // -----------------------------------------------------------------------
    // 5. a full game raises nothing, however loudly the caller shouts
    // -----------------------------------------------------------------------
    const fullGame = await makeGame({ maxParticipants: 1 }, [
      { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: second.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);
    await GameSeatService.seatOpened(fullGame.id, 4, 'CAPACITY_INCREASE');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((await deliveries(fullGame.id)).length, 0, 'no open seat, no event');

    // -----------------------------------------------------------------------
    // 6. one freed seat, one notification — the spot-opened fan-out and the
    //    play-intent matcher share a single claim
    // -----------------------------------------------------------------------
    /*
     * `leaveGame` fires both `PlayIntentMatchService.onPublicGameSlotsOpened`
     * (`GAME_MATCHES_INTENT`) and `GameSeatService.seatOpened`
     * (`GAME_SPOT_OPENED`), and their INTENT audiences come from the same
     * `intentMatchesGame` predicate. They used to dedupe against separate
     * tables, so the same user got two pushes about the same seat.
     */
    const club = await prisma.club.create({
      data: {
        name: `Spot opened club ${suffix}`,
        normalizedName: `spot opened club ${suffix}`,
        address: 'QA fixture',
        cityId: city.id,
      },
    });
    createdClubIds.push(club.id);

    const intentUser = await makeUser('intent', 3.0);
    // `enabledChannels` refuses a user with no deliverable channel, and this
    // test needs the play-intent path to be *able* to enqueue so the two paths
    // genuinely compete for the claim. Outbound sends are still suppressed by
    // `E2E_TEST`.
    await prisma.pushToken.create({
      data: {
        userId: intentUser.id,
        token: `qa-spot-token-${suffix}`,
        platform: PushPlatform.ANDROID,
      },
    });
    const intentStart = new Date(Date.now() + 20 * HOURS);
    const intentDateKey = formatInTimeZone(intentStart, 'UTC', 'yyyy-MM-dd');

    const makeIntent = async () => {
      const intent = await prisma.playIntent.create({
        data: {
          userId: intentUser.id,
          cityId: city.id,
          sport: Sport.PADEL,
          entityType: EntityType.GAME,
          dateKeys: [intentDateKey],
          clubIds: [],
          minLevel: 2.5,
          maxLevel: 3.5,
          genderTeams: GenderTeam.ANY,
          timeOfDay: PlayIntentTimeOfDay.ANYTIME,
          status: PlayIntentStatus.OPEN,
          expiresAt: new Date(intentStart.getTime() + 24 * HOURS),
        },
      });
      createdIntentIds.push(intent.id);
      return intent;
    };

    const makeRadarGame = async () => {
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          clubId: club.id,
          startTime: intentStart,
          endTime: new Date(intentStart.getTime() + 90 * 60 * 1000),
          timeIsSet: true,
          isPublic: true,
          maxParticipants: 4,
          minLevel: 2.5,
          maxLevel: 3.5,
          participants: {
            create: [
              { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
              {
                userId: playerA.id,
                role: ParticipantRole.PARTICIPANT,
                status: ParticipantStatus.PLAYING,
              },
            ],
          },
        },
      });
      createdGameIds.push(game.id);
      return game;
    };

    const intentDeliveriesFor = (gameId: string) =>
      prisma.playIntentNotificationDelivery.count({
        where: {
          userId: intentUser.id,
          eventKey: `GAME_MATCHES_INTENT:${gameId}`,
        },
      });

    /*
     * 6a — the regression. The spot-opened fan-out announces the seat first;
     * the play-intent matcher must then stay silent. Before the shared claim it
     * enqueued a `GAME_MATCHES_INTENT` delivery here, giving the user two
     * pushes about the same seat seconds apart.
     *
     * This scenario runs first on purpose: `canSendGameMatchNotification` has a
     * 90-minute per-user cooldown, so running the "matcher wins" case first
     * would make this one pass for the wrong reason.
     */
    await makeIntent();
    const seatFirstGame = await makeRadarGame();
    await GameSeatService.seatOpened(seatFirstGame.id, 1, 'LEAVE');
    await new Promise((resolve) => setTimeout(resolve, 500));
    await PlayIntentMatchService.onPublicGameSlotsOpened(seatFirstGame.id);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const seatFirstClaims = (await deliveries(seatFirstGame.id)).filter(
      (row) => row.userId === intentUser.id,
    );
    assert.equal(
      seatFirstClaims.length,
      1,
      'both paths take the same (userId, gameId, dayKey, INTENT) claim',
    );
    assert.equal(seatFirstClaims[0].kind, SpotOpenedKind.INTENT);
    assert.equal(
      await intentDeliveriesFor(seatFirstGame.id),
      0,
      'the matcher must not add a second push for a seat already announced',
    );

    // 6b — the mirror image: the matcher gets there first and owns the user,
    // so the spot-opened fan-out finds the claim taken and adds nothing.
    await prisma.playIntent.deleteMany({ where: { userId: intentUser.id } });
    await makeIntent();
    const matcherFirstGame = await makeRadarGame();
    await PlayIntentMatchService.onPublicGameSlotsOpened(matcherFirstGame.id);
    await GameSeatService.seatOpened(matcherFirstGame.id, 1, 'LEAVE');
    await new Promise((resolve) => setTimeout(resolve, 600));

    const matcherFirstClaims = (await deliveries(matcherFirstGame.id)).filter(
      (row) => row.userId === intentUser.id,
    );
    assert.equal(matcherFirstClaims.length, 1, 'still exactly one claim for the seat');
    assert.ok(
      (await intentDeliveriesFor(matcherFirstGame.id)) > 0,
      'whichever path claims first is the one that notifies',
    );

    // -----------------------------------------------------------------------
    // 7. the pill is keyed on "a seat IS open", not "a seat opened recently"
    //
    // `lastSeatOpenedAt` is never cleared. With auto-fill on, the queue head
    // takes the seat ~200 ms later and the game is full again — yet every Find
    // and My-Tab card kept the sky "A spot opened" pill, and the day-group sort
    // boost, for the remaining two hours.
    // -----------------------------------------------------------------------
    const pillHost = await makeUser('pillhost', 3.5);
    const pillSeated = await makeUser('pillseated', 3.5);
    const pillGame = await makeGame({ maxParticipants: 3 }, [
      { userId: pillHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      {
        userId: pillSeated.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.PLAYING,
      },
    ]);
    await prisma.game.update({
      where: { id: pillGame.id },
      data: { lastSeatOpenedAt: new Date() },
    });

    const withOpenSeat = await spotOpenedEnricher(pillHost.id, [{ id: pillGame.id }]);
    assert.ok(
      withOpenSeat[pillGame.id]?.spotOpenedAt,
      'a genuinely open seat still gets the pill',
    );

    const pillFiller = await makeUser('pillfiller', 3.5);
    await prisma.gameParticipant.create({
      data: {
        gameId: pillGame.id,
        userId: pillFiller.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.PLAYING,
      },
    });

    const refilled = await spotOpenedEnricher(pillHost.id, [{ id: pillGame.id }]);
    assert.equal(
      refilled[pillGame.id],
      undefined,
      'the pill clears the moment the roster is full again',
    );

    // -----------------------------------------------------------------------
    // 8. `GET /games/available/enrichment` answers only for visible games
    //
    // The payload carries PRD-derived fields — `seriesLabel` (a private
    // series' name, cadence, weekday and local start time) and `perHeadPrice`
    // (what the group now pays) — and the query applied no visibility filter,
    // so anyone holding a game id could read them, 100 ids at a time.
    // -----------------------------------------------------------------------
    const gateOwner = await makeUser('gateowner', 3.5);
    const gateMember = await makeUser('gatemember', 3.5);
    const gateOutsider = await makeUser('gateoutsider', 3.5);
    // `timeIsSet: false` keeps the weather enricher out of this assertion —
    // it is the visibility filter under test, not the forecast cache.
    const makeGateGame = async (
      isPublic: boolean,
      roster: { userId: string; role: ParticipantRole; status: ParticipantStatus }[],
    ) => {
      const startTime = new Date(Date.now() + 30 * HOURS);
      const created = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          startTime,
          endTime: new Date(startTime.getTime() + 90 * 60 * 1000),
          timeIsSet: false,
          isPublic,
          maxParticipants: 4,
          participants: { create: roster },
        },
      });
      createdGameIds.push(created.id);
      return created;
    };

    const publicGame = await makeGateGame(true, [
      { userId: gateOwner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
    ]);
    const privateGame = await makeGateGame(false, [
      { userId: gateOwner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      {
        userId: gateMember.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.PLAYING,
      },
    ]);

    const outsiderEnrichment = await enrichAvailableGamesByIds(gateOutsider.id, [
      publicGame.id,
      privateGame.id,
    ]);
    assert.ok(
      outsiderEnrichment[publicGame.id],
      'a public game still enriches for any signed-in viewer',
    );
    assert.equal(
      outsiderEnrichment[privateGame.id],
      undefined,
      'a private game the viewer has no row on produces no entry at all',
    );

    const memberEnrichment = await enrichAvailableGamesByIds(gateMember.id, [privateGame.id]);
    assert.ok(
      memberEnrichment[privateGame.id],
      'a player on the roster still gets their own private game enriched',
    );

    console.log('gameSeat.integration.test.ts: ok');
  } finally {
    await prisma.playIntentNotificationDelivery
      .deleteMany({ where: { sourceId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.pushToken
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.playIntent
      .deleteMany({ where: { id: { in: createdIntentIds } } })
      .catch(() => undefined);
    await prisma.spotOpenedDelivery.deleteMany({ where: { gameId: { in: createdGameIds } } });
    // `ChatMessage` and `ChatSyncEvent` hold the game id as a plain column, not
    // an FK, so deleting the game would leave the system messages behind.
    await prisma.chatMessage.deleteMany({ where: { gameId: { in: createdGameIds } } });
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.userSportProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.club
      .deleteMany({ where: { id: { in: createdClubIds } } })
      .catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})();
