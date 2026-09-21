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
  ATTENDANCE_SECOND_REMINDER_HOURS,
  assertAttendanceUpdateIsSafe,
  attendanceReminderRecipients,
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
  isImplicitlyConfirmedOwner,
  isWithinNoShowWindow,
  NO_SHOW_NOTE_WINDOW_MS,
  OWNER_IMPLICIT_ANSWER,
  parseAttendanceCallbackData,
  partitionAttendanceAsk,
  withOwnerImplicitAnswer,
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
/* The organizer's implicit yes                                        */
/* ------------------------------------------------------------------ */

assert.equal(OWNER_IMPLICIT_ANSWER, 'CONFIRMED');
assert.equal(isImplicitlyConfirmedOwner({ role: 'OWNER', status: 'PLAYING' }), true);
assert.equal(
  isImplicitlyConfirmedOwner({ role: 'OWNER', status: 'NON_PLAYING' }),
  false,
  'an owner who is not playing has nothing to confirm',
);
assert.equal(
  isImplicitlyConfirmedOwner({ role: 'ADMIN', status: 'PLAYING' }),
  false,
  'admins are asked like everyone else — only the owner made the game',
);
assert.equal(isImplicitlyConfirmedOwner({ role: 'PARTICIPANT', status: 'PLAYING' }), false);
assert.equal(isImplicitlyConfirmedOwner({ status: 'PLAYING' }), false);

const OWNER_ROSTER = [
  { userId: 'owner', role: 'OWNER', status: 'PLAYING', attendance: 'UNANSWERED' as const },
  { userId: 'a', role: 'PARTICIPANT', status: 'PLAYING', attendance: 'UNANSWERED' as const },
  { userId: 'host', role: 'OWNER', status: 'NON_PLAYING', attendance: 'UNANSWERED' as const },
];

assert.deepEqual(
  withOwnerImplicitAnswer(OWNER_ROSTER).map((row) => row.attendance),
  ['CONFIRMED', 'UNANSWERED', 'UNANSWERED'],
  'only the owner\'s own seat reads as confirmed',
);
assert.deepEqual(
  withOwnerImplicitAnswer(OWNER_ROSTER),
  withOwnerImplicitAnswer(withOwnerImplicitAnswer(OWNER_ROSTER)),
  'the coercion is idempotent',
);
assert.deepEqual(
  OWNER_ROSTER.map((row) => row.attendance),
  ['UNANSWERED', 'UNANSWERED', 'UNANSWERED'],
  'the implicit yes is derived, never written back onto the row',
);
assert.equal(
  withOwnerImplicitAnswer(OWNER_ROSTER)[1],
  OWNER_ROSTER[1],
  'rows that need no coercion are passed through, not copied',
);
assert.equal(
  countAttendance(withOwnerImplicitAnswer(OWNER_ROSTER)).confirmedCount,
  1,
  'the organizer counts toward "x of y confirmed"',
);
// An owner who answered "not sure" on an older client is still the organizer.
assert.equal(
  withOwnerImplicitAnswer([
    { userId: 'owner', role: 'OWNER', status: 'PLAYING', attendance: 'UNSURE' as const },
  ])[0].attendance,
  'CONFIRMED',
);

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

/* ------------------------------------------------------------------ */
/* Who gets which reminder (PRD 346)                                   */
/* ------------------------------------------------------------------ */

const REMINDER_ROSTER = [
  { id: 'unanswered', status: 'PLAYING', attendance: 'UNANSWERED' },
  { id: 'confirmed', status: 'PLAYING', attendance: 'CONFIRMED' },
  { id: 'unsure', status: 'PLAYING', attendance: 'UNSURE' },
  { id: 'looking', status: 'IN_QUEUE', attendance: 'UNANSWERED' },
  { id: 'trainer', status: 'NON_PLAYING', attendance: null },
];

// The 24 h reminder asks everybody — it is the first time the question is put.
assert.deepEqual(
  attendanceReminderRecipients(REMINDER_ROSTER, 24).map((row) => row.id),
  ['unanswered', 'confirmed', 'unsure', 'looking', 'trainer'],
  'the 24 h reminder reaches every recipient',
);

// The 2 h reminder only goes to PLAYING players who have not answered, so
// nobody who already answered is asked a second time.
assert.deepEqual(
  attendanceReminderRecipients(REMINDER_ROSTER, ATTENDANCE_SECOND_REMINDER_HOURS).map((row) => row.id),
  ['unanswered', 'looking', 'trainer'],
  'the 2 h reminder skips PLAYING players who already answered',
);

// Non-PLAYING recipients were never asked the question, so they are never
// filtered out by their (absent) answer.
assert.deepEqual(
  attendanceReminderRecipients(
    [{ id: 'looking', status: 'IN_QUEUE', attendance: 'CONFIRMED' }],
    1,
  ).map((row) => row.id),
  ['looking'],
  'a non-PLAYING recipient is never filtered on attendance',
);

// Everyone answered: there is simply nobody left to ask — never a third message
// to the players who did answer.
assert.deepEqual(
  attendanceReminderRecipients(
    [
      { id: 'a', status: 'PLAYING', attendance: 'CONFIRMED' },
      { id: 'b', status: 'PLAYING', attendance: 'UNSURE' },
    ],
    2,
  ),
  [],
  'a fully answered roster gets no second reminder',
);

// The owner never answers, so a filter that only looked at the column would ask
// them again at 2 h. The implicit yes has to reach here too.
const OWNER_REMINDER_ROSTER = [
  { id: 'owner', role: 'OWNER', status: 'PLAYING', attendance: 'UNANSWERED' },
  { id: 'player', role: 'PARTICIPANT', status: 'PLAYING', attendance: 'UNANSWERED' },
];
assert.deepEqual(
  attendanceReminderRecipients(OWNER_REMINDER_ROSTER, 2).map((row) => row.id),
  ['player'],
  'the 2 h reminder skips the owner — organizing is the answer',
);

// At 24 h the owner is still reminded, but the message must not carry the
// question: they are already confirmed.
const partitioned = partitionAttendanceAsk(
  attendanceReminderRecipients(OWNER_REMINDER_ROSTER, 24),
);
assert.deepEqual(partitioned.ask.map((row) => row.id), ['player']);
assert.deepEqual(partitioned.remindOnly.map((row) => row.id), ['owner']);
assert.deepEqual(
  partitionAttendanceAsk(REMINDER_ROSTER).remindOnly,
  [],
  'a roster with no playing owner puts the question to everyone',
);

// The boundary is inclusive, and anything above it is still "the first ask".
assert.equal(
  attendanceReminderRecipients(REMINDER_ROSTER, ATTENDANCE_SECOND_REMINDER_HOURS + 0.5).length,
  REMINDER_ROSTER.length,
  'just above the cut-off is still the everybody reminder',
);
assert.equal(
  attendanceReminderRecipients(REMINDER_ROSTER, 0.5).length,
  3,
  'below the cut-off keeps filtering',
);

// The filter decides who is *asked*. It never drops a row from the roster it
// was handed — the input array is untouched.
const rosterBefore = REMINDER_ROSTER.map((row) => row.id);
attendanceReminderRecipients(REMINDER_ROSTER, 2);
assert.deepEqual(REMINDER_ROSTER.map((row) => row.id), rosterBefore, 'the roster is not mutated');

console.log('attendanceRules.test.ts: ok');
