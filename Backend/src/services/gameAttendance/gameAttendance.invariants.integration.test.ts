/**
 * PRD 346 — the product invariant, proven against a real database.
 *
 * Confirmation is a courtesy signal, never a contract. This test snapshots the
 * whole roster, the users and their sport profiles, runs every attendance
 * operation, and asserts that **nothing outside the four attendance columns and
 * the two informational counters moved**: no seat, no queue position, no game
 * status, no `level`, no `reliability`, no `ratingUncertainty`, and no
 * `LevelChangeEvent` row.
 *
 * Safe to run against `padelpulse_dev`: every row it creates is namespaced with
 * a run suffix and deleted in `finally`.
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
import {
  getAttendanceDetails,
  noteNoShow,
  setAttendance,
  undoNoShow,
} from './gameAttendance.service';
import { getAttendanceRate, refreshAttendanceCountersForGame } from './attendanceCounters.service';
import { ATTENDANCE_RATE_MIN_SAMPLE, NO_SHOW_NOTE_WINDOW_MS } from './attendanceRules';
import { ApiError } from '../../utils/ApiError';

/** Columns an attendance operation is allowed to move. Everything else is frozen. */
const MUTABLE_PARTICIPANT_COLUMNS = new Set([
  'attendance',
  'attendanceUpdatedAt',
  'noShowNotedById',
  'noShowNotedAt',
]);

type Snapshot = {
  participants: Record<string, Record<string, unknown>>;
  profiles: Record<string, Record<string, unknown>>;
  users: Record<string, Record<string, unknown>>;
  game: Record<string, unknown>;
  levelChangeEvents: number;
};

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const createdUserIds: string[] = [];
  let cityId: string | null = null;
  const createdGameIds: string[] = [];

  const city = await prisma.city.create({
    data: { name: `Attendance invariants ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  cityId = city.id;

  try {
    const [owner, player, other, outsider] = await Promise.all(
      ['owner', 'player', 'other', 'outsider'].map((name) =>
        prisma.user.create({
          data: {
            phone: `qa-attendance-${name}-${suffix}`,
            firstName: name,
            currentCityId: city.id,
            primarySport: Sport.PADEL,
          },
        }),
      ),
    );
    createdUserIds.push(owner.id, player.id, other.id, outsider.id);

    const startTime = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime,
        endTime,
        timeIsSet: true,
        maxParticipants: 4,
        participants: {
          create: [
            { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
            { userId: player.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
            { userId: other.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
            { userId: outsider.id, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
          ],
        },
      },
    });
    createdGameIds.push(game.id);

    // Give the players a rating history worth protecting.
    for (const user of [owner, player, other]) {
      await prisma.userSportProfile.upsert({
        where: { userId_sport: { userId: user.id, sport: Sport.PADEL } },
        create: {
          userId: user.id,
          sport: Sport.PADEL,
          level: 3.25,
          reliability: 42,
          ratingUncertainty: 17,
          gamesPlayed: 11,
          gamesWon: 6,
        },
        update: { level: 3.25, reliability: 42, ratingUncertainty: 17 },
      });
    }

    const snapshot = async (): Promise<Snapshot> => {
      const participants = await prisma.gameParticipant.findMany({ where: { gameId: game.id } });
      const profiles = await prisma.userSportProfile.findMany({
        where: { userId: { in: createdUserIds } },
      });
      const users = await prisma.user.findMany({ where: { id: { in: createdUserIds } } });
      const gameRow = await prisma.game.findUniqueOrThrow({ where: { id: game.id } });
      const levelChangeEvents = await prisma.levelChangeEvent.count({
        where: { userId: { in: createdUserIds } },
      });
      return {
        participants: Object.fromEntries(
          participants.map((p) => [p.userId, p as unknown as Record<string, unknown>]),
        ),
        profiles: Object.fromEntries(
          profiles.map((p) => [`${p.userId}:${p.sport}`, p as unknown as Record<string, unknown>]),
        ),
        users: Object.fromEntries(
          users.map((u) => [u.id, u as unknown as Record<string, unknown>]),
        ),
        game: gameRow as unknown as Record<string, unknown>,
        levelChangeEvents,
      };
    };

    /**
     * The heart of this file: only the four attendance columns and the two
     * informational counters may differ between two snapshots.
     */
    const assertOnlyAttendanceMoved = (before: Snapshot, after: Snapshot, label: string) => {
      assert.deepEqual(
        Object.keys(after.participants).sort(),
        Object.keys(before.participants).sort(),
        `${label}: the roster must not gain or lose anyone`,
      );

      for (const [userId, afterRow] of Object.entries(after.participants)) {
        const beforeRow = before.participants[userId];
        for (const column of Object.keys(afterRow)) {
          if (MUTABLE_PARTICIPANT_COLUMNS.has(column)) continue;
          assert.deepEqual(
            afterRow[column],
            beforeRow[column],
            `${label}: GameParticipant.${column} of ${userId} must be unchanged`,
          );
        }
      }

      for (const [key, afterProfile] of Object.entries(after.profiles)) {
        const beforeProfile = before.profiles[key];
        assert.ok(beforeProfile, `${label}: no new sport profile may appear (${key})`);
        for (const column of Object.keys(afterProfile)) {
          // The two counters are the whole point of the feature, and `updatedAt`
          // is `@updatedAt`, so it moves mechanically whenever they do. The
          // invariant under test is the rating surface — `level`, `reliability`,
          // `ratingUncertainty` — which the loop below still pins exactly.
          if (column === 'attendedCount' || column === 'noShowCount') continue;
          if (column === 'updatedAt') continue;
          assert.deepEqual(
            afterProfile[column],
            beforeProfile[column],
            `${label}: UserSportProfile.${column} of ${key} must be unchanged`,
          );
        }
      }

      for (const [userId, afterUser] of Object.entries(after.users)) {
        assert.deepEqual(
          afterUser,
          before.users[userId],
          `${label}: the User row of ${userId} must be untouched`,
        );
      }

      // A no-show note posts the neutral chat line PRD 346 specifies, and the
      // chat pipeline stamps the thread's preview. That is the specified effect,
      // not attendance reaching into the game: what must never move is the
      // game's own state — status, results, roster size, settings.
      const CHAT_DERIVED_GAME_COLUMNS = new Set(['lastMessagePreview', 'updatedAt']);

      for (const column of Object.keys(after.game)) {
        if (CHAT_DERIVED_GAME_COLUMNS.has(column)) continue;
        assert.deepEqual(
          after.game[column],
          before.game[column],
          `${label}: Game.${column} must be unchanged — attendance never moves a game`,
        );
      }

      assert.equal(
        after.levelChangeEvents,
        before.levelChangeEvents,
        `${label}: attendance must never write a LevelChangeEvent`,
      );
    };

    /* --- answering ------------------------------------------------- */

    let before = await snapshot();
    const confirmed = await setAttendance(game.id, player.id, 'CONFIRMED');
    let after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'confirm');
    assert.equal(after.participants[player.id].attendance, 'CONFIRMED');
    assert.equal(after.participants[player.id].status, ParticipantStatus.PLAYING);
    assert.equal(confirmed.summary.confirmedCount, 1);
    assert.equal(confirmed.summary.playingCount, 3, 'the queued player is not a denominator');
    assert.equal(confirmed.summary.viewerAttendance, 'CONFIRMED');

    before = after;
    await setAttendance(game.id, player.id, 'UNSURE');
    after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'change answer');
    assert.equal(after.participants[player.id].attendance, 'UNSURE');

    // Answering twice the same way is a no-op that still succeeds.
    before = after;
    const repeated = await setAttendance(game.id, player.id, 'UNSURE');
    after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'repeat answer');
    assert.equal(repeated.attendance, 'UNSURE');

    // A queued player is not a PLAYING participant and cannot answer, and being
    // refused must not cost them their queue position.
    before = await snapshot();
    await assert.rejects(
      () => setAttendance(game.id, outsider.id, 'CONFIRMED'),
      (error: unknown) => error instanceof ApiError && error.statusCode === 403,
    );
    after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'queued player refused');
    assert.equal(after.participants[outsider.id].status, ParticipantStatus.IN_QUEUE);

    /* --- the no-show window ---------------------------------------- */

    // The game has not finished yet, so there is nothing to note.
    await assert.rejects(
      () => noteNoShow(game.id, player.id, owner.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    );

    const finishedStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await prisma.game.update({
      where: { id: game.id },
      data: {
        startTime: finishedStart,
        endTime: new Date(finishedStart.getTime() + 90 * 60 * 1000),
        status: 'FINISHED',
        resultsStatus: ResultsStatus.FINAL,
      },
    });
    await prisma.gameParticipant.updateMany({
      where: { gameId: game.id, userId: { in: [owner.id, other.id] } },
      data: { attendance: 'CONFIRMED' },
    });

    before = await snapshot();
    const noted = await noteNoShow(game.id, player.id, owner.id);
    after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'no-show note');
    assert.ok(after.participants[player.id].noShowNotedAt, 'the note is recorded');
    assert.equal(after.participants[player.id].noShowNotedById, owner.id);
    assert.equal(
      after.participants[player.id].status,
      ParticipantStatus.PLAYING,
      'a noted player keeps their seat',
    );
    assert.ok(noted.noShowNotedAt);

    // Noting twice is idempotent.
    const notedAgain = await noteNoShow(game.id, player.id, owner.id);
    assert.equal(
      new Date(notedAgain.noShowNotedAt).getTime(),
      new Date(noted.noShowNotedAt).getTime(),
      're-noting must not move the timestamp',
    );

    // An organizer cannot note themselves.
    await assert.rejects(
      () => noteNoShow(game.id, owner.id, owner.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    );

    /* --- counters and the >= 5 sample floor ------------------------- */

    await refreshAttendanceCountersForGame(game.id);
    const notedProfile = await prisma.userSportProfile.findUniqueOrThrow({
      where: { userId_sport: { userId: player.id, sport: Sport.PADEL } },
    });
    assert.equal(notedProfile.noShowCount, 1);
    assert.equal(notedProfile.attendedCount, 0, 'a noted no-show never counts as attended');
    assert.equal(notedProfile.level, 3.25, 'level is untouched');
    assert.equal(notedProfile.reliability, 42, 'reliability is untouched');
    assert.equal(notedProfile.ratingUncertainty, 17, 'ratingUncertainty is untouched');

    const ownerProfile = await prisma.userSportProfile.findUniqueOrThrow({
      where: { userId_sport: { userId: owner.id, sport: Sport.PADEL } },
    });
    assert.equal(ownerProfile.attendedCount, 1, 'a confirmed player of a FINAL game attended');

    const ownerRate = await getAttendanceRate(owner.id, Sport.PADEL);
    assert.equal(ownerRate.sampleSize, 1);
    assert.equal(
      ownerRate.rate,
      null,
      `below ${ATTENDANCE_RATE_MIN_SAMPLE} recorded games the percentage stays hidden`,
    );

    /* --- undo -------------------------------------------------------- */

    before = await snapshot();
    await undoNoShow(game.id, player.id, owner.id);
    after = await snapshot();
    assertOnlyAttendanceMoved(before, after, 'no-show undo');
    assert.equal(after.participants[player.id].noShowNotedAt, null);
    assert.equal(after.participants[player.id].noShowNotedById, null);

    const undoneProfile = await prisma.userSportProfile.findUniqueOrThrow({
      where: { userId_sport: { userId: player.id, sport: Sport.PADEL } },
    });
    assert.equal(undoneProfile.noShowCount, 0, 'undo decrements the counter');

    // Past the 7-day window nothing can be noted or undone any more.
    // The window is measured from `endTime`, so the *end* has to be outside it.
    // Anchoring `startTime` there and adding the duration puts the end back
    // inside and the game still looks noteable.
    const endedLongAgo = new Date(Date.now() - NO_SHOW_NOTE_WINDOW_MS - 60 * 60 * 1000);
    await prisma.game.update({
      where: { id: game.id },
      data: {
        startTime: new Date(endedLongAgo.getTime() - 90 * 60 * 1000),
        endTime: endedLongAgo,
      },
    });
    await assert.rejects(
      () => noteNoShow(game.id, player.id, owner.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
      'the 7-day window closes',
    );
    await assert.rejects(
      () => undoNoShow(game.id, player.id, owner.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    );

    /* --- the backdated game must not fail open ----------------------- */

    /*
     * `calculatePersistableGameStatus` refuses to persist a clock-`FINISHED`
     * status for an unscored GAME and `gameStatusScheduler` skips the write, so
     * a game logged **after** its own start time keeps `status: 'ANNOUNCED'`
     * until it archives a week later. The old `status === 'ANNOUNCED'` gate
     * therefore let a rostered player confirm attendance for a game that had
     * already happened, inflating the public "Shows up %".
     */
    const backdatedStart = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const backdated = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        startTime: backdatedStart,
        endTime: new Date(backdatedStart.getTime() + 90 * 60 * 1000),
        timeIsSet: true,
        maxParticipants: 4,
        // Exactly what the scheduler leaves behind for an unscored past game.
        status: 'ANNOUNCED',
        resultsStatus: ResultsStatus.NONE,
        participants: {
          create: [
            { userId: owner.id, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
            {
              userId: player.id,
              role: ParticipantRole.PARTICIPANT,
              status: ParticipantStatus.PLAYING,
            },
          ],
        },
      },
    });
    createdGameIds.push(backdated.id);

    const backdatedRow = await prisma.game.findUniqueOrThrow({
      where: { id: backdated.id },
      select: { status: true, resultsStatus: true },
    });
    assert.equal(
      backdatedRow.status,
      'ANNOUNCED',
      'precondition: the persisted status of a backdated unscored game stays ANNOUNCED',
    );
    assert.equal(backdatedRow.resultsStatus, ResultsStatus.NONE);

    await assert.rejects(
      () => setAttendance(backdated.id, player.id, 'CONFIRMED'),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
      'attendance must be closed on a game that already happened',
    );
    const backdatedDetails = await getAttendanceDetails(backdated.id, owner.id);
    assert.equal(
      backdatedDetails.answersOpen,
      false,
      'answersOpen must follow resultsStatus + startTime, not Game.status',
    );
    const backdatedPlayer = await prisma.gameParticipant.findFirstOrThrow({
      where: { gameId: backdated.id, userId: player.id },
    });
    assert.equal(
      backdatedPlayer.attendance,
      'UNANSWERED',
      'the refused answer must not have been written',
    );

    /* --- projection -------------------------------------------------- */

    const details = await getAttendanceDetails(game.id, owner.id);
    assert.equal(details.playingCount, 3);
    assert.equal(details.participants.length, 3, 'only PLAYING rows get a dot');
    assert.equal(details.answersOpen, false, 'a finished game asks nothing');
    assert.equal(details.noShowWindowOpen, false);
    assert.equal(details.nudge.allowed, true);

    // The no-show note fires its chat message and push fan-out with `void`; give
    // them a moment to settle so teardown does not race an in-flight write.
    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log('gameAttendance.invariants.integration.test.ts: ok');
  } finally {
    for (const gameId of createdGameIds) {
      await prisma.chatMessage.deleteMany({ where: { contextId: gameId } }).catch(() => undefined);
      await prisma.gameParticipant.deleteMany({ where: { gameId } }).catch(() => undefined);
      await prisma.game.delete({ where: { id: gameId } }).catch(() => undefined);
    }
    if (createdUserIds.length) {
      await prisma.userSportProfile
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => undefined);
    }
    if (cityId) {
      await prisma.city.delete({ where: { id: cityId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
