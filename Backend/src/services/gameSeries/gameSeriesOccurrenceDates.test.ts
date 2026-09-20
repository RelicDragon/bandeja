import assert from 'node:assert';
import {
  addDaysToDayKey,
  alignDayKeyToWeekday,
  cadenceStepDays,
  dayKeyInTimezone,
  dayKeyToEpochDay,
  dayKeyToPrismaDate,
  diffDayKeys,
  horizonThroughDayKey,
  isDayKey,
  isLocalTimeString,
  isoWeekdayOfDayKey,
  listOccurrenceDayKeys,
  localTimeInTimezone,
  nextOccurrenceOnOrAfter,
  nextWeekdayAfterDayKey,
  occurrenceEndUtc,
  occurrenceStartUtc,
  prismaDateToDayKey,
  seatDeadlineFor,
  toDayKey,
} from './gameSeriesOccurrenceDates';

/**
 * PRD 345 — occurrence date math.
 *
 * The highest-risk logic in the PRD: a weekly series is a statement about the
 * *wall clock*, so anything that adds milliseconds instead of days drifts by an
 * hour twice a year. Every DST assertion below is a real transition in a real
 * club timezone, not a synthetic offset.
 */

let failures = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log('gameSeriesOccurrenceDates');

/* ------------------------------------------------------------------ */
/* Day-key primitives                                                  */
/* ------------------------------------------------------------------ */

check('isDayKey accepts real dates and rejects impossible ones', () => {
  assert.strictEqual(isDayKey('2026-02-28'), true);
  assert.strictEqual(isDayKey('2024-02-29'), true, 'leap day');
  assert.strictEqual(isDayKey('2025-02-29'), false, 'not a leap year');
  assert.strictEqual(isDayKey('2026-13-01'), false);
  assert.strictEqual(isDayKey('2026-1-01'), false);
  assert.strictEqual(isDayKey(20260101), false);
});

check('isLocalTimeString enforces HH:mm', () => {
  assert.strictEqual(isLocalTimeString('19:00'), true);
  assert.strictEqual(isLocalTimeString('00:00'), true);
  assert.strictEqual(isLocalTimeString('23:59'), true);
  assert.strictEqual(isLocalTimeString('24:00'), false);
  assert.strictEqual(isLocalTimeString('9:00'), false);
  assert.strictEqual(isLocalTimeString('19:60'), false);
});

check('epoch-day round trip', () => {
  assert.strictEqual(dayKeyToEpochDay('1970-01-01'), 0);
  assert.strictEqual(toDayKey(0), '1970-01-01');
  assert.strictEqual(toDayKey(dayKeyToEpochDay('2026-09-20')), '2026-09-20');
  assert.strictEqual(diffDayKeys('2026-10-01', '2026-09-24'), 7);
  assert.strictEqual(diffDayKeys('2026-09-24', '2026-10-01'), -7);
});

check('addDaysToDayKey crosses month, year and leap boundaries', () => {
  assert.strictEqual(addDaysToDayKey('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(addDaysToDayKey('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(addDaysToDayKey('2024-02-28', 1), '2024-02-29');
  assert.strictEqual(addDaysToDayKey('2026-03-01', -1), '2026-02-28');
});

check('isoWeekdayOfDayKey is 1=Mon … 7=Sun', () => {
  assert.strictEqual(isoWeekdayOfDayKey('1970-01-01'), 4, 'epoch was a Thursday');
  assert.strictEqual(isoWeekdayOfDayKey('2026-09-21'), 1, 'Monday');
  assert.strictEqual(isoWeekdayOfDayKey('2026-09-22'), 2, 'Tuesday');
  assert.strictEqual(isoWeekdayOfDayKey('2026-09-27'), 7, 'Sunday');
});

check('alignDayKeyToWeekday stays inside the anchor week', () => {
  // 2026-09-22 is a Tuesday; asking for Thursday moves forward two days.
  assert.strictEqual(alignDayKeyToWeekday('2026-09-22', 4), '2026-09-24');
  // Asking for Monday moves back one day, it does not jump a week forward.
  assert.strictEqual(alignDayKeyToWeekday('2026-09-22', 1), '2026-09-21');
  assert.strictEqual(alignDayKeyToWeekday('2026-09-22', 2), '2026-09-22');
});

check('nextWeekdayAfterDayKey never lands in the seed\'s own week when it is behind', () => {
  // 2026-09-24 is a Thursday. Converting it into a Tuesday series must anchor on
  // the *following* Tuesday, not 2026-09-22 — otherwise that week holds two
  // occurrences and every later "week N" is off by one.
  assert.strictEqual(nextWeekdayAfterDayKey('2026-09-24', 2), '2026-09-29');
  // A weekday later in the same week is already after the seed.
  assert.strictEqual(nextWeekdayAfterDayKey('2026-09-22', 4), '2026-09-24');
  // Asking for the seed's own weekday moves a whole week, never zero days.
  assert.strictEqual(nextWeekdayAfterDayKey('2026-09-22', 2), '2026-09-29');
});

check('prisma @db.Date round trip is midnight UTC', () => {
  const stored = dayKeyToPrismaDate('2026-09-22');
  assert.strictEqual(stored.toISOString(), '2026-09-22T00:00:00.000Z');
  assert.strictEqual(prismaDateToDayKey(stored), '2026-09-22');
});

/* ------------------------------------------------------------------ */
/* Cadence walking                                                     */
/* ------------------------------------------------------------------ */

check('cadence step is 7 or 14 days', () => {
  assert.strictEqual(cadenceStepDays('WEEKLY'), 7);
  assert.strictEqual(cadenceStepDays('BIWEEKLY'), 14);
});

check('nextOccurrenceOnOrAfter keeps the cadence phase', () => {
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-09-22', 'WEEKLY', '2026-09-22'), '2026-09-22');
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-09-22', 'WEEKLY', '2026-09-23'), '2026-09-29');
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-09-22', 'WEEKLY', '2026-10-05'), '2026-10-06');
  // A biweekly anchor must never collapse to the in-between week.
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-09-22', 'BIWEEKLY', '2026-09-29'), '2026-10-06');
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-09-22', 'BIWEEKLY', '2026-10-06'), '2026-10-06');
  // An anchor in the future is returned untouched.
  assert.strictEqual(nextOccurrenceOnOrAfter('2026-12-01', 'WEEKLY', '2026-09-22'), '2026-12-01');
});

check('listOccurrenceDayKeys fills a 14-day horizon', () => {
  const keys = listOccurrenceDayKeys({
    anchorDayKey: '2026-09-22',
    cadence: 'WEEKLY',
    fromDayKey: '2026-09-22',
    throughDayKey: horizonThroughDayKey('2026-09-22', 14),
  });
  assert.deepStrictEqual(keys, ['2026-09-22', '2026-09-29', '2026-10-06']);
});

check('listOccurrenceDayKeys honours endsOn and skips', () => {
  const keys = listOccurrenceDayKeys({
    anchorDayKey: '2026-09-22',
    cadence: 'WEEKLY',
    fromDayKey: '2026-09-22',
    throughDayKey: '2026-10-27',
    endsOnDayKey: '2026-10-13',
    skipDayKeys: ['2026-09-29'],
  });
  assert.deepStrictEqual(keys, ['2026-09-22', '2026-10-06', '2026-10-13']);
});

check('listOccurrenceDayKeys returns nothing for an inverted window', () => {
  assert.deepStrictEqual(
    listOccurrenceDayKeys({
      anchorDayKey: '2026-09-22',
      cadence: 'WEEKLY',
      fromDayKey: '2026-10-01',
      throughDayKey: '2026-09-01',
    }),
    [],
  );
});

check('listOccurrenceDayKeys is bounded by maxCount', () => {
  const keys = listOccurrenceDayKeys({
    anchorDayKey: '2026-01-06',
    cadence: 'WEEKLY',
    fromDayKey: '2026-01-06',
    throughDayKey: '2030-01-01',
    maxCount: 5,
  });
  assert.strictEqual(keys.length, 5);
});

check('horizonThroughDayKey clamps nonsense horizons', () => {
  assert.strictEqual(horizonThroughDayKey('2026-09-22', 14), '2026-10-06');
  assert.strictEqual(horizonThroughDayKey('2026-09-22', -5), '2026-09-22');
  assert.strictEqual(horizonThroughDayKey('2026-09-22', Number.NaN), '2026-09-22');
});

/* ------------------------------------------------------------------ */
/* DST — the part that actually breaks in production                   */
/* ------------------------------------------------------------------ */

check('spring forward: Europe/Belgrade keeps 19:00 local, UTC instant shifts', () => {
  // Europe/Belgrade springs forward on 2026-03-29 (CET +01 → CEST +02).
  const before = occurrenceStartUtc('2026-03-24', '19:00', 'Europe/Belgrade');
  const after = occurrenceStartUtc('2026-03-31', '19:00', 'Europe/Belgrade');

  assert.strictEqual(before.toISOString(), '2026-03-24T18:00:00.000Z');
  assert.strictEqual(after.toISOString(), '2026-03-31T17:00:00.000Z');

  // The wall clock is what the organizer promised — identical both weeks.
  assert.strictEqual(localTimeInTimezone(before, 'Europe/Belgrade'), '19:00');
  assert.strictEqual(localTimeInTimezone(after, 'Europe/Belgrade'), '19:00');

  // Naive millisecond arithmetic would have produced 18:00 UTC and therefore
  // 20:00 local. Assert we are NOT 7 * 24 h apart.
  const naiveWeek = 7 * 86_400_000;
  assert.notStrictEqual(after.getTime() - before.getTime(), naiveWeek);
  assert.strictEqual(after.getTime() - before.getTime(), naiveWeek - 3_600_000);
});

check('fall back: Europe/Belgrade keeps 19:00 local across the October boundary', () => {
  // Europe/Belgrade falls back on 2026-10-25.
  const before = occurrenceStartUtc('2026-10-20', '19:00', 'Europe/Belgrade');
  const after = occurrenceStartUtc('2026-10-27', '19:00', 'Europe/Belgrade');

  assert.strictEqual(before.toISOString(), '2026-10-20T17:00:00.000Z');
  assert.strictEqual(after.toISOString(), '2026-10-27T18:00:00.000Z');
  assert.strictEqual(localTimeInTimezone(before, 'Europe/Belgrade'), '19:00');
  assert.strictEqual(localTimeInTimezone(after, 'Europe/Belgrade'), '19:00');
  assert.strictEqual(after.getTime() - before.getTime(), 7 * 86_400_000 + 3_600_000);
});

check('southern-hemisphere DST runs the other way (Australia/Sydney)', () => {
  // Sydney springs forward on 2026-10-04 (AEST +10 → AEDT +11).
  const before = occurrenceStartUtc('2026-09-29', '19:00', 'Australia/Sydney');
  const after = occurrenceStartUtc('2026-10-06', '19:00', 'Australia/Sydney');
  assert.strictEqual(before.toISOString(), '2026-09-29T09:00:00.000Z');
  assert.strictEqual(after.toISOString(), '2026-10-06T08:00:00.000Z');
  assert.strictEqual(localTimeInTimezone(after, 'Australia/Sydney'), '19:00');
});

check('a zone without DST is unaffected (Asia/Bangkok)', () => {
  const a = occurrenceStartUtc('2026-03-24', '19:00', 'Asia/Bangkok');
  const b = occurrenceStartUtc('2026-03-31', '19:00', 'Asia/Bangkok');
  assert.strictEqual(b.getTime() - a.getTime(), 7 * 86_400_000);
  assert.strictEqual(a.toISOString(), '2026-03-24T12:00:00.000Z');
});

check('half-hour offsets are handled (Asia/Kolkata)', () => {
  assert.strictEqual(
    occurrenceStartUtc('2026-09-22', '19:00', 'Asia/Kolkata').toISOString(),
    '2026-09-22T13:30:00.000Z',
  );
});

check('occurrenceStartUtc rejects a malformed time instead of guessing', () => {
  assert.throws(() => occurrenceStartUtc('2026-09-22', '7pm', 'Europe/Belgrade'), RangeError);
});

check('dayKeyInTimezone reads the club calendar day, not UTC', () => {
  // 22:30 UTC on the 21st is already the 22nd in Bangkok (+07).
  const instant = new Date('2026-09-21T22:30:00.000Z');
  assert.strictEqual(dayKeyInTimezone(instant, 'Asia/Bangkok'), '2026-09-22');
  assert.strictEqual(dayKeyInTimezone(instant, 'UTC'), '2026-09-21');
  // 01:30 UTC on the 22nd is still the 21st in New York (-04).
  const early = new Date('2026-09-22T01:30:00.000Z');
  assert.strictEqual(dayKeyInTimezone(early, 'America/New_York'), '2026-09-21');
});

/* ------------------------------------------------------------------ */
/* Duration and seat deadline                                          */
/* ------------------------------------------------------------------ */

check('occurrenceEndUtc adds real minutes and clamps nonsense', () => {
  const start = new Date('2026-09-22T17:00:00.000Z');
  assert.strictEqual(occurrenceEndUtc(start, 90).toISOString(), '2026-09-22T18:30:00.000Z');
  assert.strictEqual(occurrenceEndUtc(start, 0).toISOString(), '2026-09-22T17:01:00.000Z');
  assert.strictEqual(occurrenceEndUtc(start, Number.NaN).toISOString(), '2026-09-22T18:00:00.000Z');
});

check('seatDeadlineFor subtracts the stepper hours and clamps the range', () => {
  const start = new Date('2026-10-01T17:00:00.000Z');
  assert.strictEqual(seatDeadlineFor(start, 48).toISOString(), '2026-09-29T17:00:00.000Z');
  assert.strictEqual(seatDeadlineFor(start, 24).toISOString(), '2026-09-30T17:00:00.000Z');
  assert.strictEqual(seatDeadlineFor(start, 72).toISOString(), '2026-09-28T17:00:00.000Z');
  assert.strictEqual(seatDeadlineFor(start, -5).toISOString(), start.toISOString());
  assert.strictEqual(seatDeadlineFor(start, 10_000).toISOString(), '2026-09-24T17:00:00.000Z');
});

if (failures > 0) {
  console.error(`\n${failures} assertion group(s) failed`);
  process.exit(1);
}
console.log('\nAll gameSeriesOccurrenceDates checks passed');
