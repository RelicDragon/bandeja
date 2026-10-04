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
 *   · an attendance button sent before the change is refused afterwards.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed and
 * delivery is injected, so nothing leaves the process.
 */
import assert from 'node:assert/strict';
import {
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { GameUpdateService } from '../game/update.service';
import { setAttendanceFromAction } from '../gameAttendance/gameAttendance.service';
import {
  attendanceActionPredatesTimeChange,
  runTimeChangeNoticeSweep,
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

  const city = await prisma.city.create({
    data: { name: `Time change ${suffix}`, country: 'Test', timezone: 'UTC' },
  });

  const deliveries: TimeChangeNoticeDelivery[] = [];
  const deliver = async (delivery: TimeChangeNoticeDelivery) => {
    deliveries.push(delivery);
  };
  /** Sweep as if the quiet window had closed. */
  const sweepAfterWindow = () =>
    runTimeChangeNoticeSweep({
      now: new Date(Date.now() + TIME_CHANGE_NOTICE_MAX_DELAY_MS + MINUTES),
      deliver,
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

    console.log('gameTimeChange.integration.test.ts: ok');
  } finally {
    await prisma.chatMessage
      .deleteMany({ where: { gameId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.chatSyncEvent
      .deleteMany({ where: { contextId: { in: createdGameIds } } })
      .catch(() => undefined);
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } }).catch(() => undefined);
    await prisma.userSportProfile
      .deleteMany({ where: { userId: { in: createdUserIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: city.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
})();
