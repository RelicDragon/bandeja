import assert from 'node:assert/strict';
import { inheritBracketGameSchedule } from './bracketGameScheduleInheritance';

const startTime = new Date('2026-08-02T08:00:00.000Z');
const endTime = new Date('2026-08-02T08:45:00.000Z');
const source = {
  clubId: 'club-ksc',
  courtId: 'court-3',
  cityId: 'city-novi-sad',
  startTime,
  endTime,
  timeIsSet: true,
  gameCourts: [
    { courtId: 'court-3', order: 1 },
    { courtId: 'court-4', order: 2 },
  ],
  // Booking state is deliberately outside the slot schedule contract.
  hasBookedCourt: true,
  bookingStatus: 'EXTERNAL_FULL',
  externalBookings: [{ id: 'booking-1' }],
};

const inherited = inheritBracketGameSchedule(source);
assert.deepEqual(inherited, {
  clubId: 'club-ksc',
  courtId: 'court-3',
  cityId: 'city-novi-sad',
  startTime,
  endTime,
  timeIsSet: true,
  gameCourts: [
    { courtId: 'court-3', order: 1 },
    { courtId: 'court-4', order: 2 },
  ],
});
assert.notStrictEqual(inherited?.startTime, startTime, 'start time is copied');
assert.notStrictEqual(inherited?.endTime, endTime, 'end time is copied');
assert(!('hasBookedCourt' in (inherited ?? {})), 'booked flag is not inherited');
assert(!('bookingStatus' in (inherited ?? {})), 'booking status is not inherited');
assert(!('externalBookings' in (inherited ?? {})), 'booking links are not inherited');

assert.equal(inheritBracketGameSchedule(null), null, 'no source keeps normal creation defaults');

console.log('bracketGameScheduleInheritance.test.ts: ok');
