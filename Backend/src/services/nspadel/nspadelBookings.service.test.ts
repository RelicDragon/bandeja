import assert from 'assert';
import {
  buildNspadelExternalBookingId,
  buildReservationInsertBody,
  computeFreeRanges,
  minutesToLabel,
  parseTimeToMinutes,
} from './nspadelBookings.service';

assert.strictEqual(parseTimeToMinutes('08:00'), 480);
assert.strictEqual(parseTimeToMinutes('23:00:00'), 1380);
assert.strictEqual(parseTimeToMinutes('9:05'), 545);
assert.strictEqual(parseTimeToMinutes('nope'), null);
assert.strictEqual(parseTimeToMinutes('25:00'), null);

assert.strictEqual(minutesToLabel(480), '08:00');
assert.strictEqual(minutesToLabel(1380), '23:00');

// Mirrors the club site's own widget: occupied 17:00-19:00, 60-min bookings on
// a 30-min grid inside 08:00-23:00 must leave [08:00,17:00) and [19:00,23:00).
const ranges = computeFreeRanges({
  openingTime: '08:00:00',
  closingTime: '23:00:00',
  intervalMinutes: 30,
  durationMinutes: 60,
  occupied: [
    { start_time: '17:00:00', end_time: '18:00:00' },
    { start_time: '18:00:00', end_time: '19:00:00' },
  ],
  date: '2030-01-06',
  now: new Date('2030-01-01T12:00:00'),
});
assert.deepStrictEqual(ranges, [
  { start: 480, end: 1020 },
  { start: 1140, end: 1380 },
]);

// A 120-min booking cannot start at 16:30 when 17:00-18:00 is occupied.
const longRanges = computeFreeRanges({
  openingTime: '08:00:00',
  closingTime: '23:00:00',
  intervalMinutes: 30,
  durationMinutes: 120,
  occupied: [{ start_time: '17:00:00', end_time: '18:00:00' }],
  date: '2030-01-06',
  now: new Date('2030-01-01T12:00:00'),
});
assert.ok(longRanges.every((range) => range.end - range.start >= 120 || range.start + 120 > range.end));
assert.ok(
  longRanges.every((range) => range.start + 120 <= 1020 || range.start >= 1080),
  `120-min starts must avoid the occupied window: ${JSON.stringify(longRanges)}`,
);

// Past starts are skipped when the date is today (local calendar day).
const nowLocal = new Date(2030, 4, 5, 10, 15);
const pad2 = (n: number): string => String(n).padStart(2, '0');
const todayKey = `${nowLocal.getFullYear()}-${pad2(nowLocal.getMonth() + 1)}-${pad2(nowLocal.getDate())}`;
const todayRanges = computeFreeRanges({
  openingTime: '08:00:00',
  closingTime: '23:00:00',
  intervalMinutes: 30,
  durationMinutes: 60,
  occupied: [],
  date: todayKey,
  now: nowLocal,
});
assert.ok(todayRanges.length > 0);
assert.ok(todayRanges.every((range) => range.start > 10 * 60 + 15));

assert.strictEqual(
  buildNspadelExternalBookingId('court-uuid', '2030-01-06', '10:00'),
  'nspadel:court-uuid:2030-01-06:10:00',
);

// The insert body must match the club site's own reservations payload exactly.
assert.deepStrictEqual(
  buildReservationInsertBody({
    courtId: 'a91de04e-7a01-46bb-96c2-f686f570f417',
    courtType: 'singles',
    date: '2030-01-06',
    startMinutes: 600,
    endMinutes: 660,
    customerName: 'Test User',
    phone: '+381600000000',
    email: 'test@example.com',
  }),
  {
    court_id: 'a91de04e-7a01-46bb-96c2-f686f570f417',
    court_type: 'singles',
    date: '2030-01-06',
    start_time: '10:00',
    end_time: '11:00',
    duration_minutes: 60,
    customer_name: 'Test User',
    phone: '+381600000000',
    email: 'test@example.com',
    status: 'confirmed',
  },
);

console.log('nspadelBookings.service.test.ts: all passed');
