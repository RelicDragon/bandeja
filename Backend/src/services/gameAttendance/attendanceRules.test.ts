/**
 * PRD 346 — pure attendance rules + the load-bearing product invariant.
 *
 * No database, no clock, no network: every function under test takes `now`
 * explicitly. The second half of this file is a **source scan** of
 * `services/gameAttendance/`, which is the durable form of the product
 * principle: a future refactor that starts writing `level`, `reliability`,
 * `ratingUncertainty`, a `LevelChangeEvent`, a participant `status` or a queue
 * position from an attendance path fails here instead of silently turning a
 * courtesy signal into a penalty.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  ATTENDANCE_FORBIDDEN_FIELDS,
  ATTENDANCE_NUDGE_COOLDOWN_MS,
  ATTENDANCE_PARTICIPANT_WRITABLE_FIELDS,
  ATTENDANCE_RATE_MIN_SAMPLE,
  assertAttendanceUpdateIsSafe,
  attendanceRateWindowStart,
  buildAnswerUpdate,
  buildAttendanceCallbackData,
  buildNoShowNoteUpdate,
  buildNoShowUndoUpdate,
  computeAttendanceRate,
  countAttendance,
  evaluateNudgeCooldown,
  gameAcceptsAttendanceAnswers,
  isAttendanceAnswer,
  isWithinNoShowWindow,
  NO_SHOW_NOTE_WINDOW_MS,
  parseAttendanceCallbackData,
} from './attendanceRules';

const NOW = new Date('2026-06-15T12:00:00.000Z');

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

assert.equal(isAttendanceAnswer('CONFIRMED'), true);
assert.equal(isAttendanceAnswer('UNSURE'), true);
assert.equal(isAttendanceAnswer('UNANSWERED'), false, 'UNANSWERED is never a user choice');
assert.equal(isAttendanceAnswer('confirmed'), false);
assert.equal(isAttendanceAnswer(null), false);

assert.deepEqual(buildAnswerUpdate('CONFIRMED', NOW), {
  attendance: 'CONFIRMED',
  attendanceUpdatedAt: NOW,
});
assert.deepEqual(buildNoShowNoteUpdate('user_1', NOW), {
  noShowNotedById: 'user_1',
  noShowNotedAt: NOW,
});
assert.deepEqual(buildNoShowUndoUpdate(), { noShowNotedById: null, noShowNotedAt: null });

/* ------------------------------------------------------------------ */
/* The write allow-list                                                */
/* ------------------------------------------------------------------ */

assert.doesNotThrow(() => assertAttendanceUpdateIsSafe({ attendance: 'CONFIRMED' }));
for (const forbidden of ATTENDANCE_FORBIDDEN_FIELDS) {
  assert.throws(
    () => assertAttendanceUpdateIsSafe({ [forbidden]: 'anything' }),
    /Confirmation is informative only/,
    `an attendance write must never be allowed to set "${forbidden}"`,
  );
}
// The two lists must stay disjoint or the guard means nothing.
for (const writable of ATTENDANCE_PARTICIPANT_WRITABLE_FIELDS) {
  assert.equal(
    (ATTENDANCE_FORBIDDEN_FIELDS as readonly string[]).includes(writable),
    false,
    `"${writable}" cannot be both writable and forbidden`,
  );
}
for (const field of ['status', 'level', 'reliability', 'ratingUncertainty'] as const) {
  assert.equal(
    (ATTENDANCE_FORBIDDEN_FIELDS as readonly string[]).includes(field),
    true,
    `"${field}" must be on the forbidden list`,
  );
}

/* ------------------------------------------------------------------ */
/* No-show window (7 days, measured from the game's end)               */
/* ------------------------------------------------------------------ */

const ended = new Date(NOW.getTime() - 60 * 60 * 1000);
assert.equal(isWithinNoShowWindow(ended, NOW), true);
assert.equal(isWithinNoShowWindow(ended.toISOString(), NOW), true, 'ISO strings are accepted');
assert.equal(
  isWithinNoShowWindow(new Date(NOW.getTime() - NO_SHOW_NOTE_WINDOW_MS + 1000), NOW),
  true,
  'day 7 minus a second is still inside the window',
);
assert.equal(
  isWithinNoShowWindow(new Date(NOW.getTime() - NO_SHOW_NOTE_WINDOW_MS - 1000), NOW),
  false,
  'day 7 plus a second has closed',
);
assert.equal(
  isWithinNoShowWindow(new Date(NOW.getTime() + 60 * 60 * 1000), NOW),
  false,
  'a game that has not finished cannot have a no-show note',
);
assert.equal(isWithinNoShowWindow(null, NOW), false);
assert.equal(isWithinNoShowWindow('not-a-date', NOW), false);

/* ------------------------------------------------------------------ */
/* Nudge cooldown (once per 6 h per game)                              */
/* ------------------------------------------------------------------ */

assert.deepEqual(evaluateNudgeCooldown(null, NOW), {
  allowed: true,
  remainingMs: 0,
  remainingHours: 0,
  nextAllowedAt: null,
});
const justNudged = evaluateNudgeCooldown(NOW, NOW);
assert.equal(justNudged.allowed, false);
assert.equal(justNudged.remainingHours, 6);
assert.equal(justNudged.nextAllowedAt, new Date(NOW.getTime() + ATTENDANCE_NUDGE_COOLDOWN_MS).toISOString());

const oneHourLeft = evaluateNudgeCooldown(
  new Date(NOW.getTime() - ATTENDANCE_NUDGE_COOLDOWN_MS + 30 * 60 * 1000),
  NOW,
);
assert.equal(oneHourLeft.allowed, false);
assert.equal(oneHourLeft.remainingHours, 1, 'a part hour rounds up so the caption never says 0');

assert.equal(
  evaluateNudgeCooldown(new Date(NOW.getTime() - ATTENDANCE_NUDGE_COOLDOWN_MS), NOW).allowed,
  true,
);
assert.equal(evaluateNudgeCooldown('garbage', NOW).allowed, true, 'a bad row must not lock nudging');

/* ------------------------------------------------------------------ */
/* Counting — only PLAYING participants                                */
/* ------------------------------------------------------------------ */

assert.deepEqual(
  countAttendance([
    { userId: 'a', status: 'PLAYING', attendance: 'CONFIRMED' },
    { userId: 'b', status: 'PLAYING', attendance: 'UNSURE' },
    { userId: 'c', status: 'PLAYING', attendance: 'UNANSWERED' },
    { userId: 'd', status: 'PLAYING', attendance: 'CONFIRMED', noShowNotedAt: NOW },
    { userId: 'trainer', status: 'NON_PLAYING', attendance: 'CONFIRMED' },
    { userId: 'queued', status: 'IN_QUEUE', attendance: 'CONFIRMED' },
    { userId: 'invited', status: 'INVITED', attendance: 'UNANSWERED' },
  ]),
  {
    confirmedCount: 2,
    unsureCount: 1,
    unansweredCount: 1,
    playingCount: 4,
    noShowCount: 1,
  },
);
assert.deepEqual(countAttendance([]), {
  confirmedCount: 0,
  unsureCount: 0,
  unansweredCount: 0,
  playingCount: 0,
  noShowCount: 0,
});

/* ------------------------------------------------------------------ */
/* Rate and the >= 5 sample floor                                      */
/* ------------------------------------------------------------------ */

assert.equal(ATTENDANCE_RATE_MIN_SAMPLE, 5);
assert.equal(computeAttendanceRate(0, 0), null, 'no data shows nothing, not 0%');
assert.equal(computeAttendanceRate(0, 1), null, 'one missed game must never read as 0%');
assert.equal(computeAttendanceRate(4, 0), null, 'four games is still below the floor');
assert.equal(computeAttendanceRate(5, 0), 100);
assert.equal(computeAttendanceRate(4, 1), 80);
assert.equal(computeAttendanceRate(9, 1), 90);
assert.equal(computeAttendanceRate(2, 1, 3), 67, 'rounds to a whole percent');

const windowStart = attendanceRateWindowStart(NOW);
assert.equal(windowStart.getUTCFullYear(), 2025);
assert.equal(windowStart.getUTCMonth(), NOW.getUTCMonth());

/* ------------------------------------------------------------------ */
/* Telegram `at:` parser                                               */
/* ------------------------------------------------------------------ */

assert.deepEqual(parseAttendanceCallbackData('at:game_1:confirm'), {
  gameId: 'game_1',
  answer: 'CONFIRMED',
});
assert.deepEqual(parseAttendanceCallbackData('at:game_1:unsure'), {
  gameId: 'game_1',
  answer: 'UNSURE',
});
assert.equal(parseAttendanceCallbackData('at:game_1:leave'), null, 'no destructive action exists');
assert.equal(parseAttendanceCallbackData('at:game_1'), null);
assert.equal(parseAttendanceCallbackData('at:game_1:confirm:extra'), null);
assert.equal(parseAttendanceCallbackData('at::confirm'), null);
assert.equal(parseAttendanceCallbackData('at:bad id:confirm'), null);
assert.equal(parseAttendanceCallbackData('sr:game_1:accept'), null);
assert.equal(parseAttendanceCallbackData(''), null);

assert.equal(buildAttendanceCallbackData('game_1', 'CONFIRMED'), 'at:game_1:confirm');
assert.equal(buildAttendanceCallbackData('game_1', 'UNSURE'), 'at:game_1:unsure');
assert.deepEqual(
  parseAttendanceCallbackData(buildAttendanceCallbackData('game_9', 'UNSURE')),
  { gameId: 'game_9', answer: 'UNSURE' },
);
// Telegram callback payloads are capped at 64 bytes.
assert.ok(Buffer.byteLength(buildAttendanceCallbackData('c'.repeat(25), 'CONFIRMED')) <= 64);

/* ------------------------------------------------------------------ */
/* When the UI exists at all                                           */
/* ------------------------------------------------------------------ */

const answersNow = new Date('2026-05-10T12:00:00.000Z');
const upcomingStart = new Date('2026-05-10T18:00:00.000Z');
const pastStart = new Date('2026-05-09T18:00:00.000Z');

assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'ANNOUNCED', resultsStatus: 'NONE', timeIsSet: true, startTime: upcomingStart },
    answersNow,
  ),
  true,
);
assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'ANNOUNCED', resultsStatus: 'NONE', timeIsSet: false, startTime: upcomingStart },
    answersNow,
  ),
  false,
  'no time set means no attendance UI at all',
);
assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'STARTED', resultsStatus: 'NONE', timeIsSet: true, startTime: pastStart },
    answersNow,
  ),
  false,
);
assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'FINISHED', resultsStatus: 'FINAL', timeIsSet: true, startTime: pastStart },
    answersNow,
  ),
  false,
);
assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'ARCHIVED', resultsStatus: 'NONE', timeIsSet: true, startTime: upcomingStart },
    answersNow,
  ),
  false,
  'ARCHIVED is the retention hard stop even with a future start time',
);
// `resultsStatus` is the mutation lock — a scored game refuses answers even
// while the clock still says `ANNOUNCED`.
assert.equal(
  gameAcceptsAttendanceAnswers(
    {
      status: 'ANNOUNCED',
      resultsStatus: 'IN_PROGRESS',
      timeIsSet: true,
      startTime: upcomingStart,
    },
    answersNow,
  ),
  false,
);
/*
 * The regression this replaces: a backdated / logged game never leaves
 * `status: 'ANNOUNCED'` (`calculatePersistableGameStatus` refuses to persist a
 * clock-`FINISHED` status for an unscored GAME), so the old
 * `status === 'ANNOUNCED'` gate failed **open** and let a player confirm
 * attendance for a game that had already happened.
 */
assert.equal(
  gameAcceptsAttendanceAnswers(
    { status: 'ANNOUNCED', resultsStatus: 'NONE', timeIsSet: true, startTime: pastStart },
    answersNow,
  ),
  false,
  'a backdated game whose persisted status is still ANNOUNCED must refuse answers',
);
// Accepts an ISO string as well, since the Telegram/push paths hand one over.
assert.equal(
  gameAcceptsAttendanceAnswers(
    {
      status: 'ANNOUNCED',
      resultsStatus: 'NONE',
      timeIsSet: true,
      startTime: upcomingStart.toISOString(),
    },
    answersNow,
  ),
  true,
);

/* ------------------------------------------------------------------ */
/* THE PRODUCT INVARIANT — source scan of services/gameAttendance/     */
/* ------------------------------------------------------------------ */

const attendanceDir = __dirname;
const sourceFiles = readdirSync(attendanceDir).filter(
  (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
);
assert.ok(sourceFiles.length >= 3, 'the attendance service modules must be scanned');

/** Identifiers that would turn a courtesy signal into an enforcement mechanism. */
const BANNED_IDENTIFIERS = [
  'ratingUncertainty',
  'reliability',
  'levelChangeEvent',
  'LevelChangeEvent',
  'approvedAtLevel',
  'lastRatingActivityAt',
  'queuePosition',
  'acceptNonPlayingParticipant',
  'removeParticipant',
  'leaveGame',
];

/** Doc comments legitimately *name* the forbidden fields; only code is scanned. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

for (const file of sourceFiles) {
  const source = stripComments(readFileSync(path.join(attendanceDir, file), 'utf8'));
  for (const banned of BANNED_IDENTIFIERS) {
    if (file === 'attendanceRules.ts') {
      // The allow/deny lists themselves legitimately name these fields.
      continue;
    }
    assert.equal(
      source.includes(banned),
      false,
      `${file} must not reference "${banned}" — attendance is informative only (PRD 346)`,
    );
  }

  // Every participant write goes through a guarded builder.
  const participantWrites = source.match(/gameParticipant\.update(Many)?\(/g) ?? [];
  const guardedWrites = source.match(/data: build(AnswerUpdate|NoShowNoteUpdate|NoShowUndoUpdate)\(/g) ?? [];
  assert.equal(
    participantWrites.length,
    guardedWrites.length,
    `${file}: every gameParticipant write must use a build*Update() helper so assertAttendanceUpdateIsSafe runs`,
  );

  // No attendance path may write the User or UserSportProfile rating columns.
  assert.equal(
    /user\.update\(/.test(source),
    false,
    `${file} must never write the User row`,
  );
}

// The counters service is the only module allowed to touch UserSportProfile,
// and only through the two informational counter columns.
const countersSource = stripComments(
  readFileSync(path.join(attendanceDir, 'attendanceCounters.service.ts'), 'utf8'),
);
const counterWriteFields = [...countersSource.matchAll(/userSportProfile\.(\w+)\(/g)].map((m) => m[1]);
assert.deepEqual(
  [...new Set(counterWriteFields)],
  ['upsert'],
  'the counters service may only upsert a UserSportProfile row',
);
for (const banned of ['level:', 'reliability:', 'ratingUncertainty:', 'gamesPlayed:', 'totalPoints:']) {
  assert.equal(
    countersSource.includes(banned),
    false,
    `attendanceCounters.service.ts must not write "${banned}"`,
  );
}

console.log('attendanceRules.test.ts: ok');
