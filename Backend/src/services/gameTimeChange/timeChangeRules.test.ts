/**
 * Time change — pure rules and the notice copy. No database.
 */
import assert from 'node:assert/strict';
import {
  classifyScheduleChange,
  evaluateNoticeDelivery,
  groupBatchNoticeRecipients,
  isBatchDue,
  isStaleAttendanceAction,
  seriesIdFromBatchKey,
  seriesTimeChangeBatchKey,
  nextNoticeDueAt,
  noticeAsksAttendance,
  TIME_CHANGE_NOTICE_MAX_DELAY_MS,
  TIME_CHANGE_NOTICE_QUIET_MS,
  timeChangeNoticeRecipients,
} from './timeChangeRules';
import {
  buildTimeChangeBatchNoticeCopy,
  buildTimeChangeNoticeCopy,
  TIME_CHANGE_BATCH_LIST_LIMIT,
} from './timeChangeNoticeCopy';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const start = new Date('2026-06-20T18:00:00.000Z');
const end = new Date('2026-06-20T19:30:00.000Z');
const later = new Date('2026-06-20T20:00:00.000Z');
const laterEnd = new Date('2026-06-20T21:30:00.000Z');

/* --- what an edit triggers -------------------------------------------- */

const set = (s: Date, e: Date, timeIsSet = true) => ({ startTime: s, endTime: e, timeIsSet });

assert.deepEqual(classifyScheduleChange(set(start, end), set(start, end), 'GAME'), {
  timesMoved: false,
  resetAttendance: false,
  notice: false,
});
assert.deepEqual(classifyScheduleChange(set(start, end), set(later, laterEnd), 'GAME'), {
  timesMoved: true,
  resetAttendance: true,
  notice: true,
});
// End-only changes are changes too: the brief covers start *and* end.
assert.deepEqual(classifyScheduleChange(set(start, end), set(start, laterEnd), 'TRAINING'), {
  timesMoved: true,
  resetAttendance: true,
  notice: true,
});
// Cleared: reset, no notice.
assert.deepEqual(classifyScheduleChange(set(start, end), set(start, end, false), 'GAME'), {
  timesMoved: false,
  resetAttendance: true,
  notice: false,
});
// First scheduling of a TBD game: reset stale answers, but it is not a "change".
assert.deepEqual(classifyScheduleChange(set(start, end, false), set(later, laterEnd), 'LEAGUE'), {
  timesMoved: true,
  resetAttendance: true,
  notice: false,
});
// Placeholder times moving on a TBD game: nothing.
assert.deepEqual(classifyScheduleChange(set(start, end, false), set(later, laterEnd, false), 'GAME'), {
  timesMoved: true,
  resetAttendance: false,
  notice: false,
});
// Entity types without attendance never reset or notify.
for (const entityType of ['EVENT', 'LEAGUE_SEASON']) {
  const change = classifyScheduleChange(set(start, end), set(later, laterEnd), entityType);
  assert.equal(change.resetAttendance, false, entityType);
  assert.equal(change.notice, false, entityType);
}

/* --- the quiet window ------------------------------------------------- */

assert.equal(nextNoticeDueAt(NOW, NOW).getTime(), NOW.getTime() + TIME_CHANGE_NOTICE_QUIET_MS);
const muchLater = new Date(NOW.getTime() + TIME_CHANGE_NOTICE_MAX_DELAY_MS);
assert.equal(
  nextNoticeDueAt(NOW, muchLater).getTime(),
  NOW.getTime() + TIME_CHANGE_NOTICE_MAX_DELAY_MS,
  'an organizer who keeps editing cannot postpone the notice forever',
);

/* --- revalidation at delivery ----------------------------------------- */

const live = {
  entityType: 'GAME',
  status: 'ANNOUNCED',
  resultsStatus: 'NONE',
  ...set(later, laterEnd),
};
assert.deepEqual(evaluateNoticeDelivery(live, { startTime: start, endTime: end }, NOW), { send: true });
assert.deepEqual(evaluateNoticeDelivery(live, { startTime: later, endTime: laterEnd }, NOW), {
  send: false,
  reason: 'reverted',
});
assert.deepEqual(
  evaluateNoticeDelivery({ ...live, timeIsSet: false }, { startTime: start, endTime: end }, NOW),
  { send: false, reason: 'time-cleared' },
);
assert.deepEqual(
  evaluateNoticeDelivery({ ...live, resultsStatus: 'IN_PROGRESS' }, { startTime: start, endTime: end }, NOW),
  { send: false, reason: 'locked' },
);
assert.deepEqual(
  evaluateNoticeDelivery(live, { startTime: start, endTime: end }, new Date(later.getTime() + 1)),
  { send: false, reason: 'already-started' },
);
assert.deepEqual(
  evaluateNoticeDelivery({ ...live, entityType: 'EVENT' }, { startTime: start, endTime: end }, NOW),
  { send: false, reason: 'unsupported-entity' },
);

/* --- recipients ------------------------------------------------------- */

const roster = [
  { userId: 'owner', status: 'PLAYING', role: 'OWNER' },
  { userId: 'admin', status: 'PLAYING', role: 'ADMIN' },
  { userId: 'player', status: 'PLAYING', role: 'PARTICIPANT' },
  { userId: 'queued', status: 'IN_QUEUE', role: 'PARTICIPANT' },
  { userId: 'invited', status: 'INVITED', role: 'PARTICIPANT' },
  { userId: 'trainer', status: 'NON_PLAYING', role: 'PARTICIPANT' },
];
assert.deepEqual(
  timeChangeNoticeRecipients(roster, 'admin').map((row) => row.userId),
  ['owner', 'player'],
  'PLAYING only, never the editor',
);
assert.equal(noticeAsksAttendance(roster[0]), false, 'the owner is told, not asked');
assert.equal(noticeAsksAttendance(roster[2]), true);

/* --- stale attendance buttons ----------------------------------------- */

const resetAt = new Date('2026-06-15T12:00:00.500Z');
assert.equal(isStaleAttendanceAction(new Date('2026-06-15T11:59:59.000Z'), resetAt), true);
assert.equal(
  isStaleAttendanceAction(new Date('2026-06-15T12:00:00.000Z'), resetAt),
  false,
  'same second: Telegram and JWT dates are whole seconds, so give the benefit of the doubt',
);
assert.equal(isStaleAttendanceAction(new Date('2026-06-15T12:00:01.000Z'), resetAt), false);
assert.equal(isStaleAttendanceAction(new Date('2020-01-01T00:00:00.000Z'), null), false);

/* --- copy ------------------------------------------------------------- */

void (async () => {
  const copy = await buildTimeChangeNoticeCopy({
    entityType: 'GAME',
    startTime: later,
    endTime: laterEnd,
    previousStartTime: start,
    club: { name: 'Club Nine' },
    timezone: 'UTC',
    lang: 'en',
    asksAttendance: true,
    bookingNeedsAttention: true,
  });
  assert.equal(copy.title, 'Time changed');
  assert.match(copy.lines[0], /^Club Nine: now .*20:00.* \(was 18:00\)$/, 'same day: "was" shows only the hour');
  assert.equal(copy.lines[1], 'Your earlier answer was cleared. Are you coming?');
  assert.equal(copy.lines[2], 'Your court booking no longer covers the new time. Update it with the club.');

  const ownerCopy = await buildTimeChangeNoticeCopy({
    entityType: 'TRAINING',
    startTime: new Date('2026-06-21T20:00:00.000Z'),
    endTime: new Date('2026-06-21T21:00:00.000Z'),
    previousStartTime: start,
    timezone: 'UTC',
    lang: 'ru',
    asksAttendance: false,
    bookingNeedsAttention: false,
  });
  assert.ok(ownerCopy.title.endsWith('Время изменено'), ownerCopy.title);
  assert.ok(ownerCopy.title.includes(':'), 'non-GAME entities carry their label');
  assert.equal(ownerCopy.lines.length, 1, 'no ask for the owner, no booking line');
  assert.match(ownerCopy.lines[0], /18:00\)$/, 'a different day repeats the old date and time');

  /* --- batches (series "this and following") ------------------------ */

  assert.equal(seriesTimeChangeBatchKey('s1'), 'series:s1');
  assert.equal(seriesIdFromBatchKey('series:s1'), 's1');
  assert.equal(seriesIdFromBatchKey(null), null);
  assert.equal(seriesIdFromBatchKey('other:x'), null);

  const due = new Date(NOW.getTime() - 1000);
  const notYet = new Date(NOW.getTime() + 1000);
  assert.equal(isBatchDue([{ noticeDueAt: due }, { noticeDueAt: due }], NOW), true);
  assert.equal(isBatchDue([{ noticeDueAt: due }, { noticeDueAt: notYet }], NOW), false, 'waits for the slowest member');
  assert.equal(isBatchDue([{ noticeDueAt: due }, { noticeDueAt: null }], NOW), true, 'claimed members do not block');
  assert.equal(isBatchDue([], NOW), false);

  const week = 7 * 24 * 60 * 60 * 1000;
  const grouped = groupBatchNoticeRecipients([
    {
      gameId: 'g2',
      startTime: new Date(start.getTime() + week),
      editorUserId: 'owner',
      roster: [
        { userId: 'owner', status: 'PLAYING', role: 'OWNER' },
        { userId: 'a', status: 'PLAYING' },
        { userId: 'c', status: 'PLAYING' },
      ],
    },
    {
      gameId: 'g1',
      startTime: start,
      editorUserId: 'owner',
      roster: [
        { userId: 'owner', status: 'PLAYING', role: 'OWNER' },
        { userId: 'a', status: 'PLAYING' },
        { userId: 'b', status: 'PLAYING' },
        { userId: 'q', status: 'IN_QUEUE' },
      ],
    },
  ]);
  const byUser = Object.fromEntries(grouped.map((g) => [g.userId, g.gameIds]));
  assert.deepEqual(byUser, { a: ['g1', 'g2'], b: ['g1'], c: ['g2'] }, 'one entry per player, own games only, earliest first');

  const weekly = (n: number, s: Date, e: Date, prev: Date) =>
    Array.from({ length: n }, (_, i) => ({
      startTime: new Date(s.getTime() + i * week),
      endTime: new Date(e.getTime() + i * week),
      previousStartTime: new Date(prev.getTime() + i * week),
    }));

  const uniform = await buildTimeChangeBatchNoticeCopy({
    entityType: 'GAME',
    seriesName: 'Tuesday padel',
    games: weekly(3, later, laterEnd, start),
    timezone: 'UTC',
    lang: 'en',
    asksAttendance: true,
    bookingNeedsAttention: false,
  });
  assert.equal(uniform.title, 'Tuesday padel: Time changed');
  assert.match(uniform.lines[0], /3 upcoming games/);
  assert.match(uniform.lines[0], /now \S+ 20:00 \(1h 30m\) \(was 18:00\)/, uniform.lines[0]);
  assert.equal(uniform.lines.length, 2, 'summary + ask');
  assert.match(uniform.lines[1], /answers were cleared/);

  const mixed = await buildTimeChangeBatchNoticeCopy({
    entityType: 'GAME',
    seriesName: 'Tuesday padel',
    games: [
      ...weekly(1, later, laterEnd, start),
      { startTime: new Date(later.getTime() + week + 3600_000), endTime: new Date(laterEnd.getTime() + week + 3600_000), previousStartTime: new Date(start.getTime() + week) },
    ],
    timezone: 'UTC',
    lang: 'en',
    asksAttendance: false,
    bookingNeedsAttention: true,
  });
  assert.match(mixed.lines[0], /new times for upcoming games \(2\)/);
  assert.equal(mixed.lines.filter((l) => l.startsWith('• ')).length, 2, 'one dated line per game when times differ');
  assert.match(mixed.lines[mixed.lines.length - 1], /court booking/);

  const long = await buildTimeChangeBatchNoticeCopy({
    entityType: 'GAME',
    games: Array.from({ length: TIME_CHANGE_BATCH_LIST_LIMIT + 2 }, (_, i) => ({
      startTime: new Date(later.getTime() + i * week + i * 60_000),
      endTime: new Date(laterEnd.getTime() + i * week),
      previousStartTime: new Date(start.getTime() + i * week),
    })),
    timezone: 'UTC',
    lang: 'ru',
    asksAttendance: false,
    bookingNeedsAttention: false,
  });
  assert.equal(long.lines.filter((l) => l.startsWith('• ')).length, TIME_CHANGE_BATCH_LIST_LIMIT);
  assert.equal(long.lines[long.lines.length - 1], 'и ещё 2');

  console.log('timeChangeRules.test.ts: ok');
})();
