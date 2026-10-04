/**
 * Time change — pure rules and the notice copy. No database.
 */
import assert from 'node:assert/strict';
import {
  classifyScheduleChange,
  evaluateNoticeDelivery,
  isStaleAttendanceAction,
  nextNoticeDueAt,
  noticeAsksAttendance,
  TIME_CHANGE_NOTICE_MAX_DELAY_MS,
  TIME_CHANGE_NOTICE_QUIET_MS,
  timeChangeNoticeRecipients,
} from './timeChangeRules';
import { buildTimeChangeNoticeCopy } from './timeChangeNoticeCopy';

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

  console.log('timeChangeRules.test.ts: ok');
})();
