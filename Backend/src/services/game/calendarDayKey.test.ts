import assert from 'node:assert/strict';
import { formatCalendarDayKey } from './calendarDayKey';

assert.equal(
  formatCalendarDayKey(new Date('2026-01-01T23:30:00.000Z'), 'Europe/Belgrade'),
  '2026-01-02',
);
assert.equal(
  formatCalendarDayKey(new Date('2026-07-01T22:30:00.000Z'), 'Europe/Belgrade'),
  '2026-07-02',
);
// DST starts in Belgrade on 2026-03-29; bucketing must stay calendar-correct.
assert.equal(
  formatCalendarDayKey(new Date('2026-03-28T22:30:00.000Z'), 'Europe/Belgrade'),
  '2026-03-28',
);
assert.equal(
  formatCalendarDayKey(new Date('2026-03-28T23:30:00.000Z'), 'Europe/Belgrade'),
  '2026-03-29',
);
const originalWarn = console.warn;
const warnings: unknown[][] = [];
console.warn = (...args: unknown[]) => warnings.push(args);
try {
  assert.equal(
    formatCalendarDayKey(new Date('2026-07-01T22:30:00.000Z'), 'Invalid/Timezone'),
    '2026-07-01',
  );
  assert.equal(
    formatCalendarDayKey(new Date('2026-07-02T22:30:00.000Z'), 'Invalid/Timezone'),
    '2026-07-02',
  );
  assert.equal(warnings.length, 1, 'invalid timezone telemetry should be de-duplicated');
} finally {
  console.warn = originalWarn;
}

console.log('calendarDayKey.test.ts: ok');
