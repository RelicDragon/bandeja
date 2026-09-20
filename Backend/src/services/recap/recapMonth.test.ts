import assert from 'node:assert/strict';
import {
  daysInMonthKey,
  isMonthKey,
  isRecapGenerationDay,
  monthKeyOf,
  monthKeyRange,
  monthWeekdayOffset,
  oldestRetainedMonthKey,
  previousMonthKey,
  recapLowActivityLookbackStart,
  shiftMonthKey,
} from './recapMonth';

// --- month key shape -------------------------------------------------------

assert.equal(isMonthKey('2026-09'), true);
assert.equal(isMonthKey('2026-13'), false, 'month 13 is rejected');
assert.equal(isMonthKey('2026-00'), false, 'month 00 is rejected');
assert.equal(isMonthKey('2026-9'), false, 'the month must be zero padded');
assert.equal(isMonthKey(202609), false, 'a number is not a month key');

assert.equal(monthKeyOf(new Date('2026-09-30T23:59:59.999Z')), '2026-09');
assert.equal(monthKeyOf(new Date('2026-10-01T00:00:00.000Z')), '2026-10');

// --- windows ---------------------------------------------------------------

const september = monthKeyRange('2026-09');
assert.equal(september.start.toISOString(), '2026-09-01T00:00:00.000Z');
assert.equal(september.end.toISOString(), '2026-10-01T00:00:00.000Z');

assert.equal(daysInMonthKey('2026-09'), 30);
assert.equal(daysInMonthKey('2026-02'), 28);
assert.equal(daysInMonthKey('2028-02'), 29, 'leap February has 29 days');

// 2026-09-01 is a Tuesday → Monday-based offset 1.
assert.equal(monthWeekdayOffset('2026-09'), 1);
// 2026-02-01 is a Sunday → Monday-based offset 6.
assert.equal(monthWeekdayOffset('2026-02'), 6);

assert.throws(() => monthKeyRange('nope'), /Invalid monthKey/);

// --- previous / shift ------------------------------------------------------

assert.equal(previousMonthKey(new Date('2026-10-01T04:00:00.000Z')), '2026-09');
assert.equal(
  previousMonthKey(new Date('2026-01-02T04:00:00.000Z')),
  '2025-12',
  'January rolls back across the year boundary',
);
assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
assert.equal(shiftMonthKey('2026-12', 1), '2027-01');

// --- the day window --------------------------------------------------------

for (const day of [1, 2, 3]) {
  assert.equal(
    isRecapGenerationDay(new Date(`2026-10-0${day}T04:00:00.000Z`)),
    true,
    `day ${day} is inside the generation window`,
  );
}
for (const day of ['04', '15', '31']) {
  assert.equal(
    isRecapGenerationDay(new Date(`2026-10-${day}T04:00:00.000Z`)),
    false,
    `day ${day} is outside the generation window`,
  );
}

// --- retention -------------------------------------------------------------

assert.equal(
  oldestRetainedMonthKey(new Date('2026-10-01T04:00:00.000Z')),
  '2025-10',
  'twelve months back, inclusive',
);

assert.equal(
  recapLowActivityLookbackStart(new Date('2026-09-01T00:00:00.000Z')).toISOString(),
  '2026-06-03T00:00:00.000Z',
  'the low-activity lookback is 90 days before the month start',
);

console.log('✅ recapMonth tests passed');
