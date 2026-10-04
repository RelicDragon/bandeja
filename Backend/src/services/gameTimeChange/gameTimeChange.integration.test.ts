/**
 * Time change against a real database, through the
 * shared edit path `GameUpdateService.updateGame` — the same call the game
 * page, league fixture edits, series edits and the AI agent's tools make.
 *
 * Proves:
 *   · a time edit clears PLAYING answers, keeps the editor's own answer and the
 *     owner's implicit yes, and moves nothing else (seat, role, queue, no-show);
 *   · a non-time edit resets nothing and queues nothing;
 *   · rapid edits coalesce into one notice that carries the final time and
 *     goes to PLAYING participants except the editor;
 *   · an edit reverted inside the quiet window sends nothing;
 *   · a linked booking that no longer covers the game is flagged for its
 *     booker, and the booking row itself is never touched;
 *   · an attendance button sent before the change is refused afterwards;
 *   · a series "this and following" time edit sends ONE combined notice per
 *     player (their own games, final times), resets attendance per game, is
 *     claimed exactly once even by concurrent sweepers, excludes a game that
 *     locked before delivery, and sends nothing when reverted;
 *   · linking / unlinking a booking that moves the time resets attendance
 *     (the linker keeps their answer) and queues the same notice; a link that
 *     matches the current time does nothing.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed and
 * delivery is injected, so nothing leaves the process.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameSeriesCadence,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { GameUpdateService } from '../game/update.service';
import { setAttendanceFromAction } from '../gameAttendance/gameAttendance.service';
import { linkBookingToGame, patchGameBookings } from '../game/gameExternalBooking.service';
import { GameSeriesService } from '../gameSeries/gameSeries.service';
import {
  attendanceActionPredatesTimeChange,
  runTimeChangeNoticeSweep,
  type TimeChangeBatchNoticeDelivery,
  type TimeChangeNoticeDelivery,
} from './gameTimeChange.service';
import { TIME_CHANGE_NOTICE_MAX_DELAY_MS, TIME_CHANGE_NOTICE_QUIET_MS } from './timeChangeRules';

// Nothing must leave the process.
process.env.E2E_TEST = '1';

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  const createdGameIds: string[] = [];
  const createdSeriesIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Time change ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const deliveries: TimeChangeNoticeDelivery[] = [];
  const deliver = async (delivery: TimeChangeNoticeDelivery) => {
    deliveries.push(delivery);
  };
  const batchDeliveries: TimeChangeBatchNoticeDelivery[] = [];
  const deliverBatch = async (delivery: TimeChangeBatchNoticeDelivery) => {
    batchDeliveries.push(delivery);
  };
  /** Sweep as if the quiet window had closed. */
  const sweepAfterWindow = () =>
    runTimeChangeNoticeSweep({
      now: new Date(Date.now() + TIME_CHANGE_NOTICE_MAX_DELAY_MS + MINUTES),
      deliver,
      deliverBatch,
    });

  try {
    const users = await Promise.all(
      ['owner', 'admin', 'playerA', 'playerB', 'queued', 'trainer'].map((name) =>
        prisma.user.create({
          data: {
            phone: `qa-timechange-${name}-${suffix}`,
            firstName: name,
            currentCityId: city.id,
            primarySport: Sport.PADEL,
          },
        }),
      ),
    );
    const [owner, admin, playerA, playerB, queued, trainer] = users;
    createdUserIds.push(...users.map((u) => u.id));

    const originalStart = new Date(Math.ceil((Date.now() + 2 * 24 * HOURS) / HOURS) * HOURS);
    const originalEnd = new Date(originalStart.getTime() + 90 * MINUTES);

    const makeGame = async () => {
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          startTime: originalStart,
          endTime: originalEnd,
          timeIsSet: true,
          maxParticipants: 4,
          trainerId: trainer.id,
          participants: {
            create: [
              { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
              { userId: admin.id, role: ParticipantRole.ADMIN, status: ParticipantStatus.PLAYING, attendance: 'CONFIRMED' },
              { userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING, attendance: 'CONFIRMED' },
              { userId: playerB.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING, attendance: 'UNSURE' },
              { userId: queued.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
              { userId: trainer.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.NON_PLAYING },
            ],
          },
        },
      });
      createdGameIds.push(game.id);
      return game;
    };

    const roster = async (gameId: string) => {
      const rows = await prisma.gameParticipant.findMany({ where: { gameId } });
      return Object.fromEntries(rows.map((row) => [row.userId, row]));
    };

    /* --- a non-time edit resets nothing -------------------------------- */

    const game = await makeGame();
    await GameUpdateService.updateGame(game.id, { name: `Renamed ${suffix}` }, owner.id, false);
    let rows = await roster(game.id);
    assert.equal(rows[playerA.id].attendance, 'CONFIRMED', 'renaming must not clear answers');
    assert.equal(rows[playerB.id].attendance, 'UNSURE');
    assert.equal(
      await prisma.gameTimeChange.count({ where: { gameId: game.id } }),
      0,
      'a non-time edit queues no notice',
    );

    // Re-sending the same times (the edit form often does) is not a change.
    await GameUpdateService.updateGame(
      game.id,
      { startTime: originalStart.toISOString(), endTime: originalEnd.toISOString() },
      owner.id,
      false,
    );
    rows = await roster(game.id);
    assert.equal(rows[playerA.id].attendance, 'CONFIRMED', 'unchanged times must not clear answers');
    assert.equal(await prisma.gameTimeChange.count({ where: { gameId: game.id } }), 0);

    /* --- a time edit by an admin ---------------------------------------- */

    const before = await roster(game.id);
    const issuedBeforeChange = new Date(Date.now() - 5000);
    const movedStart = new Date(originalStart.getTime() + 2 * HOURS);
    const movedEnd = new Date(movedStart.getTime() + 90 * MINUTES);
    await GameUpdateService.updateGame(
      game.id,
      { startTime: movedStart.toISOString(), endTime: movedEnd.toISOString() },
      admin.id,
      false,
    );
    rows = await roster(game.id);
    assert.equal(rows[playerA.id].attendance, 'UNANSWERED', 'old "I\'m coming" never carries over');
    assert.equal(rows[playerA.id].attendanceUpdatedAt, null);
    assert.equal(rows[playerB.id].attendance, 'UNANSWERED');
    assert.equal(rows[admin.id].attendance, 'CONFIRMED', 'the editor picked the new time; their answer stays');
    for (const [userId, row] of Object.entries(rows)) {
      for (const column of ['status', 'role', 'joinedAt', 'noShowNotedAt', 'noShowNotedById'] as const) {
        assert.deepEqual(row[column], before[userId][column], `${column} of ${userId} must not move`);
      }
    }

    let state = await prisma.gameTimeChange.findUniqueOrThrow({ where: { gameId: game.id } });
    assert.ok(state.noticeDueAt, 'a notice is queued');
    assert.ok(state.attendanceResetAt, 'the reset is stamped');
    assert.equal(state.previousStartTime?.getTime(), originalStart.getTime());
    assert.equal(state.editorUserId, admin.id);

    /* --- stale attendance buttons are refused ---------------------------- */

    assert.equal(await attendanceActionPredatesTimeChange(game.id, issuedBeforeChange), true);
    const stale = await setAttendanceFromAction(playerA.id, game.id, 'CONFIRMED', issuedBeforeChange);
    assert.deepEqual(stale, { ok: false, errorKey: 'errors.attendance.timeChanged' });
    rows = await roster(game.id);
    assert.equal(rows[playerA.id].attendance, 'UNANSWERED', 'a stale button records nothing');

    /* --- a second edit inside the window coalesces ---------------------- */

    const firstDueAt = state.noticeDueAt!;
    const firstVersion = state.version;
    const finalStart = new Date(originalStart.getTime() + 3 * HOURS);
    const finalEnd = new Date(finalStart.getTime() + 90 * MINUTES);
    await GameUpdateService.updateGame(
      game.id,
      { startTime: finalStart.toISOString(), endTime: finalEnd.toISOString() },
      admin.id,
      false,
    );
    state = await prisma.gameTimeChange.findUniqueOrThrow({ where: { gameId: game.id } });
    assert.equal(
      state.previousStartTime?.getTime(),
      originalStart.getTime(),
      'the burst still remembers what players were last told',
    );
    assert.ok(state.version > firstVersion);
    assert.ok(state.noticeDueAt!.getTime() >= firstDueAt.getTime(), 'the quiet window slides');

    // A button sent after the change works again.
    const fresh = await setAttendanceFromAction(playerA.id, game.id, 'CONFIRMED', new Date(Date.now() + 2000));
    assert.deepEqual(fresh, { ok: true });

    // Nothing is due while the organizer is still editing.
    const early = await runTimeChangeNoticeSweep({ now: new Date(), deliver });
    assert.equal(early.claimed, 0, 'no notice inside the quiet window');
    assert.ok(TIME_CHANGE_NOTICE_QUIET_MS > 0);

    const swept = await sweepAfterWindow();
    assert.equal(swept.sent, 1);
    assert.equal(deliveries.length, 1, 'two edits, one notice');
    const [delivery] = deliveries;
    assert.equal(delivery.game.startTime.getTime(), finalStart.getTime(), 'the notice carries the final time');
    assert.equal(delivery.previousStartTime.getTime(), originalStart.getTime());
    assert.deepEqual(
      delivery.recipients.map((r) => r.userId).sort(),
      [owner.id, playerA.id, playerB.id].sort(),
      'PLAYING participants except the editor — no queue, no trainer',
    );
    const ownerRecipient = delivery.recipients.find((r) => r.userId === owner.id)!;
    assert.equal(ownerRecipient.asksAttendance, false, 'the owner is told, not asked');
    assert.equal(delivery.recipients.find((r) => r.userId === playerB.id)!.asksAttendance, true);

    const again = await sweepAfterWindow();
    assert.equal(again.claimed, 0, 'a delivered notice is never sent twice');
    assert.equal(deliveries.length, 1);

    /* --- an edit reverted inside the window sends nothing --------------- */

    await GameUpdateService.updateGame(
      game.id,
      { startTime: movedStart.toISOString(), endTime: movedEnd.toISOString() },
      owner.id,
      false,
    );
    await GameUpdateService.updateGame(
      game.id,
      { startTime: finalStart.toISOString(), endTime: finalEnd.toISOString() },
      owner.id,
      false,
    );
    const reverted = await sweepAfterWindow();
    assert.equal(reverted.claimed, 1);
    assert.equal(reverted.skipped.reverted, 1, 'back where players were told: no notice');
    assert.equal(deliveries.length, 1);

    /* --- clearing the time resets answers but sends no notice ------------ */

    await prisma.gameParticipant.updateMany({
      where: { gameId: game.id, userId: playerB.id },
      data: { attendance: 'CONFIRMED' },
    });
    await GameUpdateService.updateGame(game.id, { timeIsSet: false }, owner.id, false);
    rows = await roster(game.id);
    assert.equal(rows[playerB.id].attendance, 'UNANSWERED', 'a cleared time clears answers');
    const cleared = await sweepAfterWindow();
    assert.equal(cleared.claimed, 0, 'clearing the time queues no "time changed" notice');

    /* --- linked bookings that no longer cover the game ------------------ */

    const booked = await makeGame();
    const booking = await prisma.gameExternalBooking.create({
      data: {
        gameId: booked.id,
        externalBookingId: `qa-timechange-booking-${suffix}`,
        bookingStart: originalStart,
        bookingEnd: originalEnd,
        bookedByUserId: playerA.id,
      },
    });
    await prisma.game.update({
      where: { id: booked.id },
      data: { hasBookedCourt: true, bookingStatus: 'EXTERNAL_FULL', timeOverride: true },
    });

    deliveries.length = 0;
    const lateStart = new Date(originalStart.getTime() + HOURS);
    await GameUpdateService.updateGame(
      booked.id,
      {
        startTime: lateStart.toISOString(),
        endTime: new Date(lateStart.getTime() + 90 * MINUTES).toISOString(),
        timeOverride: true,
      },
      owner.id,
      false,
    );
    const bookedGame = await prisma.game.findUniqueOrThrow({ where: { id: booked.id } });
    assert.equal(bookedGame.startTime.getTime(), lateStart.getTime(), 'the edit stands; the booking does not pull it back');
    assert.equal(bookedGame.bookingStatus, 'EXTERNAL_PARTIAL', 'coverage is recalculated');
    const bookingAfter = await prisma.gameExternalBooking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(bookingAfter.bookingStart?.getTime(), originalStart.getTime(), 'the reservation is never moved');
    assert.equal(bookingAfter.bookingEnd?.getTime(), originalEnd.getTime());

    await sweepAfterWindow();
    assert.equal(deliveries.length, 1);
    const flagged = deliveries[0].recipients.filter((r) => r.bookingNeedsAttention).map((r) => r.userId);
    assert.deepEqual(flagged, [playerA.id], 'only the booker is told their booking needs attention');

    /* --- series "this and following": one notice per player ------------ */

    const seriesSeedStart = new Date(Math.ceil((Date.now() + 2 * 24 * HOURS) / HOURS) * HOURS);
    const seriesSeed = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime: seriesSeedStart,
        endTime: new Date(seriesSeedStart.getTime() + 90 * MINUTES),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 4,
      },
    });
    createdGameIds.push(seriesSeed.id);
    await prisma.gameParticipant.createMany({
      data: [
        { gameId: seriesSeed.id, userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
        { gameId: seriesSeed.id, userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
      ],
    });
    const { seriesId } = await GameSeriesService.createSeriesFromGame(seriesSeed.id, owner.id, {
      cadence: GameSeriesCadence.WEEKLY,
      name: `Time change series ${suffix}`,
      horizonDays: 21,
    });
    createdSeriesIds.push(seriesId);
    const seriesGames = await prisma.game.findMany({
      where: { seriesId },
      orderBy: { startTime: 'asc' },
      select: { id: true, startTime: true },
    });
    for (const row of seriesGames) if (!createdGameIds.includes(row.id)) createdGameIds.push(row.id);
    assert.ok(seriesGames.length >= 3, `the series has at least three occurrences (got ${seriesGames.length})`);

    // Known roster on every occurrence: owner + playerA everywhere (answered),
    // playerB on the first occurrence only, and admin on none.
    for (const [index, row] of seriesGames.entries()) {
      await prisma.gameParticipant.deleteMany({ where: { gameId: row.id } });
      await prisma.gameParticipant.createMany({
        data: [
          { gameId: row.id, userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
          { gameId: row.id, userId: playerA.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING, attendance: 'CONFIRMED' },
          ...(index === 0
            ? [{ gameId: row.id, userId: playerB.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING, attendance: 'UNSURE' as const }]
            : []),
        ],
      });
    }

    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    const seriesNewLocal = hhmm(new Date(seriesSeedStart.getTime() + 2 * HOURS));
    deliveries.length = 0;
    batchDeliveries.length = 0;

    const seriesEdit = await GameSeriesService.updateSeries(seriesId, owner.id, {
      scope: 'future',
      startTimeLocal: seriesNewLocal,
    });
    const editedIds = seriesEdit.updatedGameIds;
    assert.ok(editedIds.length >= 3, 'every unstarted occurrence moved');
    for (const gameId of editedIds) {
      const r = await roster(gameId);
      assert.equal(r[playerA.id].attendance, 'UNANSWERED', 'attendance resets per game');
    }
    const batchRows = await prisma.gameTimeChange.findMany({ where: { gameId: { in: editedIds } } });
    assert.equal(batchRows.length, editedIds.length);
    assert.ok(batchRows.every((row) => row.noticeBatchKey === `series:${seriesId}`), 'every notice joins the batch');

    // The last occurrence locks before delivery: it drops out of the notice.
    const lockedLate = editedIds[editedIds.length - 1];
    await prisma.game.update({ where: { id: lockedLate }, data: { resultsStatus: ResultsStatus.IN_PROGRESS } });

    // Two sweepers at once (two servers / a restart mid-pass): one notice.
    const [sweepOne, sweepTwo] = await Promise.all([sweepAfterWindow(), sweepAfterWindow()]);
    assert.equal(sweepOne.batchesSent + sweepTwo.batchesSent, 1, 'the batch is claimed exactly once');
    assert.equal(sweepOne.claimed + sweepTwo.claimed, editedIds.length);
    assert.equal(deliveries.length, 0, 'no per-game notices for a series edit');
    assert.equal(batchDeliveries.length, 1);
    const batch = batchDeliveries[0];
    assert.equal(batch.seriesId, seriesId);
    assert.equal(batch.seriesName, `Time change series ${suffix}`);
    const sentGameIds = batch.games.map((g) => g.game.id);
    assert.deepEqual(sentGameIds, editedIds.filter((id) => id !== lockedLate), 'locked games are excluded, earliest first');
    for (const entry of batch.games) {
      assert.equal(hhmm(entry.game.startTime), seriesNewLocal, 'the notice carries the new time');
      assert.equal(hhmm(entry.previousStartTime), hhmm(seriesSeedStart), 'and what players were told before');
    }
    const byRecipient = Object.fromEntries(batch.recipients.map((r) => [r.userId, r]));
    assert.deepEqual(Object.keys(byRecipient).sort(), [playerA.id, playerB.id].sort(), 'one entry per player; the editor (owner) is not told');
    assert.deepEqual(byRecipient[playerA.id].gameIds, sentGameIds, 'playerA: one notice for all their games');
    assert.deepEqual(byRecipient[playerB.id].gameIds, [editedIds[0]], 'playerB: only the game they play in');
    assert.equal(byRecipient[playerA.id].asksAttendance, true);

    const seriesAgain = await sweepAfterWindow();
    assert.equal(seriesAgain.claimed, 0, 'a delivered batch is never sent twice');
    assert.equal(batchDeliveries.length, 1);

    // A series edit reverted inside the window sends nothing. (The locked
    // occurrence stays locked, so the series edit leaves it alone.)
    await GameSeriesService.updateSeries(seriesId, owner.id, {
      scope: 'future',
      startTimeLocal: hhmm(new Date(seriesSeedStart.getTime() + 3 * HOURS)),
    });
    await GameSeriesService.updateSeries(seriesId, owner.id, { scope: 'future', startTimeLocal: seriesNewLocal });
    const seriesReverted = await sweepAfterWindow();
    assert.equal(seriesReverted.claimed, editedIds.length - 1);
    assert.equal(seriesReverted.batchesSent, 0, 'back where players were told: no notice');
    assert.equal(seriesReverted.sent, 0);
    assert.equal(seriesReverted.skipped.reverted, editedIds.length - 1);
    assert.equal(batchDeliveries.length, 1);
    assert.equal(deliveries.length, 0);

    /* --- booking link / unlink that moves the time ------------------------ */

    const linkGame = await makeGame(); // timeOverride false: bookings drive the time
    deliveries.length = 0;
    const linkedStart = new Date(originalStart.getTime() + 2 * HOURS);
    const linkedEnd = new Date(linkedStart.getTime() + 90 * MINUTES);
    await linkBookingToGame(linkGame.id, admin.id, false, {
      externalBookingId: `qa-timechange-link-${suffix}`,
      snapshot: {
        externalBookingId: `qa-timechange-link-${suffix}`,
        bookingStart: linkedStart.toISOString(),
        bookingEnd: linkedEnd.toISOString(),
      },
    });
    const linkedGame = await prisma.game.findUniqueOrThrow({ where: { id: linkGame.id } });
    assert.equal(linkedGame.startTime.getTime(), linkedStart.getTime(), 'the booking moved the game');
    rows = await roster(linkGame.id);
    assert.equal(rows[playerA.id].attendance, 'UNANSWERED', 'a booking-driven move clears answers');
    assert.equal(rows[admin.id].attendance, 'CONFIRMED', 'the user who linked keeps their answer');
    state = await prisma.gameTimeChange.findUniqueOrThrow({ where: { gameId: linkGame.id } });
    assert.ok(state.noticeDueAt, 'a notice is queued');
    assert.equal(state.editorUserId, admin.id);
    assert.equal(state.previousStartTime?.getTime(), originalStart.getTime());
    assert.ok(await attendanceActionPredatesTimeChange(linkGame.id, new Date(Date.now() - 5000)), 'old buttons stop working');
    await sweepAfterWindow();
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].game.id, linkGame.id);
    assert.deepEqual(
      deliveries[0].recipients.map((r) => r.userId).sort(),
      [owner.id, playerA.id, playerB.id].sort(),
      'same recipients as an edit: PLAYING minus the linker',
    );
    assert.equal(deliveries[0].recipients.some((r) => r.bookingNeedsAttention), false, 'the new booking covers the game');

    // Unlinking one of two bookings shrinks the derived time: same behaviour.
    const secondStart = linkedEnd;
    const secondEnd = new Date(secondStart.getTime() + 60 * MINUTES);
    await linkBookingToGame(linkGame.id, admin.id, false, {
      externalBookingId: `qa-timechange-link2-${suffix}`,
      snapshot: {
        externalBookingId: `qa-timechange-link2-${suffix}`,
        bookingStart: secondStart.toISOString(),
        bookingEnd: secondEnd.toISOString(),
      },
    });
    assert.equal(
      (await prisma.game.findUniqueOrThrow({ where: { id: linkGame.id } })).endTime.getTime(),
      secondEnd.getTime(),
      'a second adjacent booking extends the game',
    );
    await sweepAfterWindow(); // flush the extension notice
    await prisma.gameParticipant.updateMany({
      where: { gameId: linkGame.id, userId: { in: [playerA.id, playerB.id] } },
      data: { attendance: 'CONFIRMED' },
    });
    deliveries.length = 0;
    await patchGameBookings(linkGame.id, playerB.id, true, { remove: [`qa-timechange-link2-${suffix}`] });
    const unlinked = await prisma.game.findUniqueOrThrow({ where: { id: linkGame.id } });
    assert.equal(unlinked.endTime.getTime(), linkedEnd.getTime(), 'unlinking moved the end back');
    rows = await roster(linkGame.id);
    assert.equal(rows[playerA.id].attendance, 'UNANSWERED', 'an unlink that moves the time clears answers');
    assert.equal(rows[playerB.id].attendance, 'CONFIRMED', 'the user who unlinked keeps their answer');
    await sweepAfterWindow();
    assert.equal(deliveries.length, 1, 'the unlink sends one notice');
    assert.ok(!deliveries[0].recipients.some((r) => r.userId === playerB.id), 'not to the unlinker');

    // A link that matches the current time changes nothing.
    const matchGame = await makeGame();
    deliveries.length = 0;
    await linkBookingToGame(matchGame.id, owner.id, false, {
      externalBookingId: `qa-timechange-match-${suffix}`,
      snapshot: {
        externalBookingId: `qa-timechange-match-${suffix}`,
        bookingStart: originalStart.toISOString(),
        bookingEnd: originalEnd.toISOString(),
      },
    });
    rows = await roster(matchGame.id);
    assert.equal(rows[playerA.id].attendance, 'CONFIRMED', 'a matching link keeps every answer');
    assert.equal(rows[playerB.id].attendance, 'UNSURE');
    assert.equal(
      await prisma.gameTimeChange.count({ where: { gameId: matchGame.id } }),
      0,
      'a matching link queues nothing',
    );
    await sweepAfterWindow();
    assert.equal(deliveries.length, 0);

    console.log('gameTimeChange.integration.test.ts: ok');
  } finally {
    await prisma.gameSeriesRegular
      .deleteMany({ where: { seriesId: { in: createdSeriesIds } } })
      .catch(() => undefined);
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
