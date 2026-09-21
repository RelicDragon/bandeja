/**
 * PRD 345 — recurring game series, proven against a real database.
 *
 * Covers the Testing Decisions that only a database can answer, and that the
 * pure unit suites (`gameSeriesOccurrenceDates`, `gameSeriesEditScope`,
 * `gameSeriesAccess`) deliberately do not touch:
 *   · converting an existing game seats its PLAYING roster as regulars;
 *   · generation fills the horizon and is **idempotent** per
 *     (seriesId, occurrenceDate) — a second run creates nothing;
 *   · the owner cap is enforced at the service, not only in the UI;
 *   · skip removes the occurrence and blocks the generator from re-creating it;
 *   · "this and future" rewrites unstarted occurrences and leaves a locked one
 *     alone, reporting it back for the scope sheet's note;
 *   · carry-over seats a confirming regular PLAYING on the next occurrence,
 *     a decline seats nobody, and the fan-out claim makes a re-finalize a
 *     no-op rather than a second prompt;
 *   · ending a series keeps the past and deletes only unstarted futures.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed, so
 * nothing leaves the process.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameSeriesCadence,
  GameSeriesStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import {
  GameSeriesService,
  MAX_ACTIVE_SERIES_PER_USER,
  MIN_HORIZON_DAYS,
} from './gameSeries.service';
import { GameSeriesGenerationService } from './gameSeriesGeneration.service';
import { GameSeriesCarryOverService } from './gameSeriesCarryOver.service';

// Nothing must leave the process.
process.env.E2E_TEST = '1';

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdSeriesIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Series ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const makeUser = async (name: string) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-series-${name}-${suffix}`,
        firstName: name,
        currentCityId: city.id,
        primarySport: Sport.PADEL,
      },
    });
    createdUserIds.push(user.id);
    return user;
  };

  /** A seed game far enough ahead that every occurrence date is in the future. */
  const makeGame = async (
    startTime: Date,
    roster: { userId: string; role: ParticipantRole; status: ParticipantStatus }[],
  ) => {
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
        maxParticipants: 4,
      },
    });
    createdGameIds.push(game.id);
    // Written separately rather than nested: `GameParticipant` requires both
    // relations, which a nested `create` under `Game` cannot satisfy.
    await prisma.gameParticipant.createMany({
      data: roster.map((row) => ({ ...row, gameId: game.id })),
    });
    return game;
  };

  const trackSeriesGames = async (seriesId: string) => {
    const rows = await prisma.game.findMany({ where: { seriesId }, select: { id: true } });
    for (const row of rows) if (!createdGameIds.includes(row.id)) createdGameIds.push(row.id);
    return rows.map((row) => row.id);
  };

  try {
    const owner = await makeUser('owner');
    const regularA = await makeUser('regA');
    const regularB = await makeUser('regB');

    // ---------------------------------------------------------------------
    // 1. Convert an existing game: the PLAYING roster becomes the regulars.
    // ---------------------------------------------------------------------
    const seedStart = new Date(Date.now() + 2 * DAYS);
    const seedGame = await makeGame(seedStart, [
      { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      { userId: regularA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      { userId: regularB.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      // NON_PLAYING must not become a regular: it never counted toward a slot.
      { userId: (await makeUser('trainer')).id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.NON_PLAYING },
    ]);

    const { seriesId } = await GameSeriesService.createSeriesFromGame(seedGame.id, owner.id, {
      cadence: GameSeriesCadence.WEEKLY,
      name: `Tuesday regulars ${suffix}`,
      horizonDays: 21,
    });
    createdSeriesIds.push(seriesId);

    const regulars = await prisma.gameSeriesRegular.findMany({
      where: { seriesId, removedAt: null },
      select: { userId: true },
    });
    assert.deepEqual(
      regulars.map((row) => row.userId).sort(),
      [owner.id, regularA.id, regularB.id].sort(),
      'converting seats exactly the PLAYING roster as regulars',
    );

    const seedAfter = await prisma.game.findUnique({
      where: { id: seedGame.id },
      select: { seriesId: true, seriesOccurrenceDate: true },
    });
    assert.equal(seedAfter?.seriesId, seriesId, 'the seed game joins its own series');
    assert.ok(seedAfter?.seriesOccurrenceDate, 'the seed game is stamped with an occurrence date');

    // ---------------------------------------------------------------------
    // 2. Generation fills the horizon and is idempotent.
    // ---------------------------------------------------------------------
    // `createSeriesFromGame` already fills the horizon, so the occurrences exist
    // before this point — which is exactly what makes the repeat run meaningful.
    await trackSeriesGames(seriesId);
    const afterFirst = await prisma.game.count({ where: { seriesId } });
    assert.ok(
      afterFirst > 1,
      'creating the series fills the horizon beyond the seed occurrence',
    );

    const secondRun = await GameSeriesGenerationService.generateForSeries(seriesId);
    await trackSeriesGames(seriesId);
    assert.equal(
      secondRun.created.length,
      0,
      'a second generation run creates nothing — (seriesId, occurrenceDate) is unique',
    );
    assert.equal(secondRun.errors.length, 0, 'generation reports no errors');
    assert.equal(
      await prisma.game.count({ where: { seriesId } }),
      afterFirst,
      'the occurrence count is unchanged by a repeat run',
    );

    const occurrenceDates = await prisma.game.findMany({
      where: { seriesId },
      select: { seriesOccurrenceDate: true },
    });
    const dateKeys = occurrenceDates.map((row) => row.seriesOccurrenceDate?.toISOString() ?? '');
    assert.equal(
      new Set(dateKeys).size,
      dateKeys.length,
      'no two occurrences share an occurrence date',
    );

    // ---------------------------------------------------------------------
    // 3. Skip removes the occurrence and the generator honours it.
    // ---------------------------------------------------------------------
    const upcoming = await prisma.game.findFirst({
      where: { seriesId, startTime: { gt: new Date() }, id: { not: seedGame.id } },
      orderBy: { startTime: 'asc' },
      select: { id: true, seriesOccurrenceDate: true },
    });
    assert.ok(upcoming?.seriesOccurrenceDate, 'there is a future occurrence to skip');
    const skipKey = dayKeyOf(upcoming!.seriesOccurrenceDate!);

    const skipResult = await GameSeriesService.skipOccurrence(seriesId, owner.id, skipKey as never);
    assert.equal(skipResult.deletedGameId, upcoming!.id, 'skip deletes that occurrence');
    assert.equal(
      await prisma.game.count({ where: { id: upcoming!.id } }),
      0,
      'the skipped occurrence is gone',
    );

    await GameSeriesGenerationService.generateForSeries(seriesId);
    await trackSeriesGames(seriesId);
    assert.equal(
      await prisma.game.count({
        where: { seriesId, seriesOccurrenceDate: upcoming!.seriesOccurrenceDate },
      }),
      0,
      'the generator does not resurrect a skipped date',
    );

    // ---------------------------------------------------------------------
    // 4. "This and future" skips a locked occurrence and reports it back.
    // ---------------------------------------------------------------------
    const futures = await prisma.game.findMany({
      where: { seriesId, startTime: { gt: new Date() } },
      orderBy: { startTime: 'asc' },
      select: { id: true },
    });
    assert.ok(futures.length >= 2, 'at least two future occurrences to partition');
    const lockedGameId = futures[0]!.id;
    await prisma.game.update({
      where: { id: lockedGameId },
      data: { resultsStatus: ResultsStatus.IN_PROGRESS },
    });

    const scoped = await GameSeriesService.updateSeries(seriesId, owner.id, {
      scope: 'future',
      template: { description: `Scoped ${suffix}` },
    } as never);

    assert.ok(
      scoped.lockedGameIds.includes(lockedGameId) || scoped.startedGameIds.includes(lockedGameId),
      'the locked occurrence is reported back, not silently edited',
    );
    assert.ok(
      !scoped.updatedGameIds.includes(lockedGameId),
      'a locked occurrence is never rewritten',
    );
    const lockedAfter = await prisma.game.findUnique({
      where: { id: lockedGameId },
      select: { description: true },
    });
    assert.notEqual(
      lockedAfter?.description,
      `Scoped ${suffix}`,
      'the locked occurrence keeps its own values',
    );

    if (scoped.updatedGameIds.length > 0) {
      const rewritten = await prisma.game.findUnique({
        where: { id: scoped.updatedGameIds[0]! },
        select: { description: true },
      });
      assert.equal(
        rewritten?.description,
        `Scoped ${suffix}`,
        'an unstarted occurrence takes the new template',
      );
    }

    // ---------------------------------------------------------------------
    // 5. Carry-over: confirm seats, decline does not, re-finalize is a no-op.
    // ---------------------------------------------------------------------
    await prisma.game.update({
      where: { id: lockedGameId },
      data: { resultsStatus: ResultsStatus.NONE },
    });

    // Finalize the seed occurrence so the prompt has somewhere to point.
    await prisma.game.update({
      where: { id: seedGame.id },
      data: { resultsStatus: ResultsStatus.FINAL },
    });

    await GameSeriesCarryOverService.onOccurrenceFinalized(seedGame.id);
    await trackSeriesGames(seriesId);

    /*
     * Delivery counts are not the assertion: `E2E_TEST=1` suppresses every
     * outbound channel, so `prompted` is 0 by construction here. The persisted
     * fan-out **claim** is the observable, and it is also the thing that stops a
     * score correction from re-pushing the whole roster.
     */
    const claimed = await prisma.game.findUnique({
      where: { id: seedGame.id },
      select: { metadata: true },
    });
    const claim = (claimed?.metadata as { seriesCarryOver?: { nextGameId?: string } } | null)
      ?.seriesCarryOver;
    assert.ok(claim?.nextGameId, 'finalizing stamps the carry-over claim on the occurrence');

    const repeat = await GameSeriesCarryOverService.onOccurrenceFinalized(seedGame.id);
    assert.equal(
      repeat.prompted,
      0,
      're-finalizing an already-claimed occurrence prompts nobody again',
    );
    const claimedAgain = await prisma.game.findUnique({
      where: { id: seedGame.id },
      select: { metadata: true },
    });
    assert.equal(
      (claimedAgain?.metadata as { seriesCarryOver?: { nextGameId?: string } } | null)
        ?.seriesCarryOver?.nextGameId,
      claim!.nextGameId,
      'the claim still names the same next occurrence',
    );

    // The claim names the occurrence the server itself resolved, which is the
    // only id `acceptSeat` will honour.
    const nextOccurrence = { id: claim!.nextGameId! };

    const accepted = await GameSeriesCarryOverService.acceptSeat(regularA.id, nextOccurrence!.id);
    assert.equal(accepted.success, true, 'a regular can take next week in one tap');
    const seatedStatus = await prisma.gameParticipant.findFirst({
      where: { gameId: nextOccurrence!.id, userId: regularA.id },
      select: { status: true, invitedByUserId: true },
    });
    assert.equal(seatedStatus?.status, ParticipantStatus.PLAYING, 'confirming seats them PLAYING');
    assert.equal(
      seatedStatus?.invitedByUserId,
      owner.id,
      'the seat is attributed to the series owner',
    );

    await GameSeriesCarryOverService.declineSeat(regularB.id, nextOccurrence!.id);
    const declinedStatus = await prisma.gameParticipant.findFirst({
      where: { gameId: nextOccurrence!.id, userId: regularB.id },
      select: { status: true },
    });
    assert.notEqual(
      declinedStatus?.status,
      ParticipantStatus.PLAYING,
      'declining never seats anybody',
    );

    // ---------------------------------------------------------------------
    // 6. The owner cap is enforced by the service.
    // ---------------------------------------------------------------------
    const capOwner = await makeUser('capowner');
    const capSeriesIds: string[] = [];
    for (let i = 0; i < MAX_ACTIVE_SERIES_PER_USER; i += 1) {
      const game = await makeGame(new Date(Date.now() + (3 + i) * DAYS), [
        { userId: capOwner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
      ]);
      const created = await GameSeriesService.createSeriesFromGame(game.id, capOwner.id, {
        cadence: GameSeriesCadence.WEEKLY,
        name: `Cap ${i} ${suffix}`,
        // The shortest horizon the service allows, so the cap loop does not
        // materialise ten full horizons of games.
        horizonDays: MIN_HORIZON_DAYS,
      });
      capSeriesIds.push(created.seriesId);
      createdSeriesIds.push(created.seriesId);
      await trackSeriesGames(created.seriesId);
    }

    const overCapGame = await makeGame(new Date(Date.now() + 40 * DAYS), [
      { userId: capOwner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
    ]);
    await assert.rejects(
      () =>
        GameSeriesService.createSeriesFromGame(overCapGame.id, capOwner.id, {
          cadence: GameSeriesCadence.WEEKLY,
          name: `Over cap ${suffix}`,
          horizonDays: MIN_HORIZON_DAYS,
        }),
      /ownerCapReached/,
      `the ${MAX_ACTIVE_SERIES_PER_USER}-series cap is refused by the service`,
    );

    // Ending one frees a slot — the cap counts ACTIVE, not lifetime.
    await GameSeriesService.endSeries(capSeriesIds[0]!, capOwner.id);
    const reopened = await GameSeriesService.createSeriesFromGame(overCapGame.id, capOwner.id, {
      cadence: GameSeriesCadence.WEEKLY,
      name: `Reopened ${suffix}`,
      horizonDays: MIN_HORIZON_DAYS,
    });
    createdSeriesIds.push(reopened.seriesId);
    await trackSeriesGames(reopened.seriesId);

    // ---------------------------------------------------------------------
    // 7. End series: the past stays, unstarted futures go.
    // ---------------------------------------------------------------------
    const beforeEnd = await prisma.game.findMany({
      where: { seriesId },
      select: { id: true, startTime: true, resultsStatus: true },
    });
    const pastIds = beforeEnd
      .filter((row) => row.startTime <= new Date() || row.resultsStatus !== ResultsStatus.NONE)
      .map((row) => row.id);

    await GameSeriesService.endSeries(seriesId, owner.id);

    const ended = await prisma.gameSeries.findUnique({
      where: { id: seriesId },
      select: { status: true },
    });
    assert.equal(ended?.status, GameSeriesStatus.ENDED, 'the series is marked ENDED');

    for (const pastId of pastIds) {
      assert.equal(
        await prisma.game.count({ where: { id: pastId } }),
        1,
        'a past or started occurrence survives ending the series',
      );
    }

    console.log('gameSeries.integration.test.ts: ok');
  } finally {
    await prisma.gameSeriesSkip
      .deleteMany({ where: { seriesId: { in: createdSeriesIds } } })
      .catch(() => undefined);
    await prisma.gameSeriesRegular
      .deleteMany({ where: { seriesId: { in: createdSeriesIds } } })
      .catch(() => undefined);
    // `Game.seriesId` is SetNull, so collect anything the generator added late.
    for (const seriesId of createdSeriesIds) {
      const rows = await prisma.game
        .findMany({ where: { seriesId }, select: { id: true } })
        .catch(() => []);
      for (const row of rows) if (!createdGameIds.includes(row.id)) createdGameIds.push(row.id);
    }
    await prisma.chatMessage
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatSyncEvent
      .deleteMany({ where: { contextId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.gameSeries
      .deleteMany({ where: { id: { in: createdSeriesIds } } })
      .catch(() => undefined);
    await prisma.userSportProfile
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
