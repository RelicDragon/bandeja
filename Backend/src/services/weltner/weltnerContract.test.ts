import assert from 'node:assert/strict';
import {
  assertWeltnerDate,
  normalizeWeltnerPhone,
  parseWeltnerAvailability,
  weltnerBookingRange,
} from './weltnerContract';

assert.equal(normalizeWeltnerPhone('00 381 (60) 123-4567'), '+381601234567');
for (const phone of ['', '0601234567', '+381', '+381<script>', '+381+601234567', null])
  assert.throws(() => normalizeWeltnerPhone(phone));
const now = new Date('2026-09-20T12:00:00Z');
assertWeltnerDate('2026-09-20', 'Europe/Belgrade', now);
assertWeltnerDate('2026-10-20', 'Europe/Belgrade', now);
for (const date of ['2026-09-19', '2026-10-21', '2026-02-30', 'bad'])
  assert.throws(() => assertWeltnerDate(date, 'Europe/Belgrade', now));
assertWeltnerDate('2026-09-21', 'Europe/Belgrade', new Date('2026-09-20T23:30:00Z'));
assert.throws(() =>
  assertWeltnerDate('2026-09-20', 'Europe/Belgrade', new Date('2026-09-20T23:30:00Z')),
);
const range = weltnerBookingRange('2026-09-21', '22:00', 120, 'Europe/Belgrade');
assert.equal(range.bookingStart.toISOString(), '2026-09-21T20:00:00.000Z');
assert.equal(range.bookingEnd.toISOString(), '2026-09-21T22:00:00.000Z');
assert.throws(() => weltnerBookingRange('2026-03-29', '02:30', 60, 'Europe/Belgrade'));
assert.throws(() => weltnerBookingRange('2026-09-21', '22:00', 30, 'Europe/Belgrade'));
const body = {
  court: 'teren-1-yucatan',
  date: '2026-09-21',
  slots: [{ start: '22:00', end: '00:00', duration: 120 }],
};
assert.equal(parseWeltnerAvailability(body, body.court, body.date).slots.length, 1);
assert.throws(() => parseWeltnerAvailability(body, 'teren-2-azteca', body.date));
assert.throws(() =>
  parseWeltnerAvailability(
    { ...body, slots: [{ start: '22:00', end: '23:00', duration: 120 }] },
    body.court,
    body.date,
  ),
);
console.log('Weltner phone, date, duration, midnight and availability contract checks passed');
