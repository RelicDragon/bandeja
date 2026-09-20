/**
 * PRD 347 — a queued player taking a freed seat, proven against a real database.
 *
 * The "spot opened" push targets the queue and its only action is **Join now**
 * (`/games/:id?join=1`), which runs `ParticipantService.joinGame`. Before this
 * regression suite existed, that method rejected *every* queued caller with
 * `games.alreadyInJoinQueue`, so the notification's own audience could not act
 * on it. The seat is now takeable — but only through the same gates as any
 * other join, and never when the organizer seats players by hand.
 *
 * Covered here, because `joinGame` is shared by every join surface:
 *   · a queued player takes a genuinely free seat and ends up PLAYING;
 *   · `allowDirectJoin = false` refuses self-promotion with a clear message and
 *     leaves the queue slot untouched;
 *   · the level gate still refuses, and does not re-announce the queue join;
 *   · a full roster still refuses;
 *   · an already-PLAYING caller still gets the unchanged error;
 *   · a locked roster (`resultsStatus !== NONE`) still wins over everything;
 *   · two queued players racing for one seat — exactly one is seated, the
 *     roster never exceeds `maxParticipants`, and the loser gets the ordinary
 *     "game is full" refusal rather than a deadlock or a 500.
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
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { ParticipantService } from './participant.service';
import { ApiError } from '../../utils/ApiError';

process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  let slot = 0;

  const city = await prisma.city.create({
    data: { name: `Join from queue ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = async (name: string, level: number) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-joinqueue-${name}-${suffix}`,
        firstName: name,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(user.id);
    await prisma.userSportProfile.create({
      data: { userId: user.id, sport: Sport.PADEL, level },
    });
    return user;
  };

  /** Each game gets its own slot so no fixture can trip the overlap confirm. */
  const makeGame = async (
    overrides: {
      maxParticipants?: number;
      allowDirectJoin?: boolean;
      resultsStatus?: ResultsStatus;
      minLevel?: number | null;
      maxLevel?: number | null;
    },
    roster: { userId: string; role: ParticipantRole; status: ParticipantStatus }[],
  ) => {
    slot += 1;
    const startTime = new Date(Date.now() + slot * 24 * HOURS);
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
        maxParticipants: overrides.maxParticipants ?? 4,
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

  const statusOf = async (gameId: string, userId: string) =>
    (
      await prisma.gameParticipant.findFirst({
        where: { gameId, userId },
        select: { status: true },
      })
    )?.status ?? null;

  const messageCount = (gameId: string) => prisma.chatMessage.count({ where: { gameId } });

  const rejection = async (run: () => Promise<unknown>): Promise<ApiError> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof ApiError) return error;
      throw error;
    }
    throw new assert.AssertionError({ message: 'expected joinGame to reject' });
  };

  let owners = 0;
  const owner = async () => {
    owners += 1;
    return makeUser(`owner${owners}`, 3.5);
  };

  try {
    // -----------------------------------------------------------------------
    // 1. the happy path the push promises: a free seat, taken from the queue
    // -----------------------------------------------------------------------
    const host = await owner();
    const queued = await makeUser('queued', 3.5);
    const freeSeat = await makeGame({ maxParticipants: 4, allowDirectJoin: true }, [
      { userId: host.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: queued.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);

    assert.equal(
      await ParticipantService.joinGame(freeSeat.id, queued.id),
      'games.joinedSuccessfully',
    );
    assert.equal(
      await statusOf(freeSeat.id, queued.id),
      ParticipantStatus.PLAYING,
      'the queued player the notification targeted ends up seated',
    );
    assert.equal(
      await prisma.gameParticipant.count({
        where: { gameId: freeSeat.id, status: ParticipantStatus.PLAYING },
      }),
      2,
      'promotion, not a duplicate row',
    );

    // -----------------------------------------------------------------------
    // 2. manual accept: the organizer decides, not the queued player
    // -----------------------------------------------------------------------
    const manualHost = await owner();
    const manualQueued = await makeUser('manual', 3.5);
    const manualGame = await makeGame({ maxParticipants: 4, allowDirectJoin: false }, [
      { userId: manualHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      {
        userId: manualQueued.id,
        role: ParticipantRole.PARTICIPANT,
        status: ParticipantStatus.IN_QUEUE,
      },
    ]);
    const before = await messageCount(manualGame.id);

    const manualError = await rejection(() =>
      ParticipantService.joinGame(manualGame.id, manualQueued.id),
    );
    assert.equal(manualError.statusCode, 400);
    assert.equal(
      manualError.message,
      'spots.queue.waitForOrganizer',
      'a readable reason, not the raw already-in-queue error',
    );
    assert.equal(
      await statusOf(manualGame.id, manualQueued.id),
      ParticipantStatus.IN_QUEUE,
      'the queue slot survives a refused self-promotion',
    );
    assert.equal(await messageCount(manualGame.id), before, 'nothing is re-announced in chat');

    // -----------------------------------------------------------------------
    // 3. the level gate still refuses a queued player
    // -----------------------------------------------------------------------
    const levelHost = await owner();
    const lowLevel = await makeUser('lowlevel', 1);
    const levelGame = await makeGame(
      { maxParticipants: 4, allowDirectJoin: true, minLevel: 3, maxLevel: 4.5 },
      [
        { userId: levelHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
        { userId: lowLevel.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
      ],
    );
    const beforeLevel = await messageCount(levelGame.id);

    assert.equal(
      await ParticipantService.joinGame(levelGame.id, lowLevel.id),
      'games.addedToQueueLevelOutOfRange',
    );
    assert.equal(
      await statusOf(levelGame.id, lowLevel.id),
      ParticipantStatus.IN_QUEUE,
      'a queued player outside the level band is never seated',
    );
    assert.equal(
      await messageCount(levelGame.id),
      beforeLevel,
      'a player already in the queue is not announced into it again',
    );

    // -----------------------------------------------------------------------
    // 4. a full roster still refuses
    // -----------------------------------------------------------------------
    const fullHost = await owner();
    const fullSeated = await makeUser('seated', 3.5);
    const fullQueued = await makeUser('fullqueued', 3.5);
    const fullGame = await makeGame({ maxParticipants: 2, allowDirectJoin: true }, [
      { userId: fullHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: fullSeated.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: fullQueued.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
    ]);
    assert.equal(
      await ParticipantService.joinGame(fullGame.id, fullQueued.id),
      'errors.invites.gameFull',
    );
    assert.equal(await statusOf(fullGame.id, fullQueued.id), ParticipantStatus.IN_QUEUE);
    assert.equal(
      await prisma.gameParticipant.count({
        where: { gameId: fullGame.id, status: ParticipantStatus.PLAYING },
      }),
      2,
      'the roster never overfills',
    );

    // -----------------------------------------------------------------------
    // 5. an already-seated player keeps the unchanged error
    // -----------------------------------------------------------------------
    const seatedError = await rejection(() =>
      ParticipantService.joinGame(fullGame.id, fullSeated.id),
    );
    assert.equal(seatedError.statusCode, 400);
    assert.equal(
      seatedError.message,
      'Already joined this game as a player',
      'the already-PLAYING contract is untouched',
    );

    // -----------------------------------------------------------------------
    // 6. a locked roster wins over both queue branches
    // -----------------------------------------------------------------------
    for (const allowDirectJoin of [true, false]) {
      const lockedHost = await owner();
      const lockedQueued = await makeUser(`locked${allowDirectJoin ? 'direct' : 'manual'}`, 3.5);
      const lockedGame = await makeGame(
        { maxParticipants: 4, allowDirectJoin, resultsStatus: ResultsStatus.IN_PROGRESS },
        [
          { userId: lockedHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
          {
            userId: lockedQueued.id,
            role: ParticipantRole.PARTICIPANT,
            status: ParticipantStatus.IN_QUEUE,
          },
        ],
      );
      const lockedError = await rejection(() =>
        ParticipantService.joinGame(lockedGame.id, lockedQueued.id),
      );
      assert.equal(lockedError.statusCode, 400);
      assert.equal(
        lockedError.message,
        'errors.games.cannotJoinResultsStarted',
        `the roster lock answers first (allowDirectJoin=${allowDirectJoin})`,
      );
      assert.equal(await statusOf(lockedGame.id, lockedQueued.id), ParticipantStatus.IN_QUEUE);
    }

    // -----------------------------------------------------------------------
    // 7. two queued players tap "Join now" for one seat — exactly one wins
    //
    // PRD 347 makes this the *designed* path: when a seat frees up and
    // auto-fill is off, the spot-opened push goes to the **whole queue** at
    // once. Before `joinGame` took `SELECT … FOR UPDATE` on the game row, both
    // transactions read "3 of 4 taken" under READ COMMITTED, both passed
    // `validatePlayerCanJoinGame`, and both wrote a PLAYING row — a 5-player
    // roster in a 4-slot game, with no DB constraint to stop it.
    //
    // Repeated, because a lost race is timing-dependent: the invariant that
    // must hold every single time is the roster size.
    // -----------------------------------------------------------------------
    for (let round = 0; round < 3; round += 1) {
      const raceHost = await owner();
      const raceSeated = await makeUser(`raceseat${round}`, 3.5);
      const raceA = await makeUser(`racea${round}`, 3.5);
      const raceB = await makeUser(`raceb${round}`, 3.5);
      const raceGame = await makeGame({ maxParticipants: 3, allowDirectJoin: true }, [
        { userId: raceHost.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
        {
          userId: raceSeated.id,
          role: ParticipantRole.PARTICIPANT,
          status: ParticipantStatus.PLAYING,
        },
        { userId: raceA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
        { userId: raceB.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
      ]);

      const outcomes = await Promise.allSettled([
        ParticipantService.joinGame(raceGame.id, raceA.id),
        ParticipantService.joinGame(raceGame.id, raceB.id),
      ]);

      const seatedCount = await prisma.gameParticipant.count({
        where: { gameId: raceGame.id, status: ParticipantStatus.PLAYING },
      });
      assert.equal(
        seatedCount,
        3,
        `round ${round}: the roster never exceeds maxParticipants under contention`,
      );

      const winners = outcomes.filter(
        (o) => o.status === 'fulfilled' && o.value === 'games.joinedSuccessfully',
      );
      assert.equal(winners.length, 1, `round ${round}: exactly one caller is seated`);

      // The loser gets the ordinary "full" refusal — never a deadlock, never a
      // 500. It arrives either as the 200-path reason (they were still queued
      // when the capacity re-check ran) or as the in-transaction 400.
      const loser = outcomes.find(
        (o) => !(o.status === 'fulfilled' && o.value === 'games.joinedSuccessfully'),
      )!;
      if (loser.status === 'fulfilled') {
        assert.equal(
          loser.value,
          'errors.invites.gameFull',
          `round ${round}: the loser is told the game is full`,
        );
      } else {
        assert.ok(
          loser.reason instanceof ApiError,
          `round ${round}: the loser gets an ApiError, not a raw database failure`,
        );
        assert.equal((loser.reason as ApiError).statusCode, 400);
        assert.equal((loser.reason as ApiError).message, 'errors.invites.gameFull');
      }

      // The loser keeps their queue slot, exactly as the non-concurrent path.
      const queued = await prisma.gameParticipant.count({
        where: { gameId: raceGame.id, status: ParticipantStatus.IN_QUEUE },
      });
      assert.equal(queued, 1, `round ${round}: the loser stays in the queue`);
    }

    console.log('joinFromQueue.integration.test.ts: ok');
  } finally {
    // `ChatMessage` and `ChatSyncEvent` hold the game id as a plain column, not
    // an FK, so deleting the game would leave them behind.
    await prisma.chatMessage.deleteMany({ where: { gameId: { in: createdGameIds } } });
    await prisma.chatSyncEvent.deleteMany({ where: { contextId: { in: createdGameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.userSportProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.city.deleteMany({ where: { id: city.id } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
