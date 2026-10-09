import { formatGameBookingStatusLabel } from './notification-base';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const en = 'en';

assert(
  formatGameBookingStatusLabel({ bookingStatus: 'EXTERNAL_FULL' }, en) === 'All courts booked',
  'EXTERNAL_FULL',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'EXTERNAL_PARTIAL' }, en) === 'Partly booked',
  'EXTERNAL_PARTIAL',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'MANUAL' }, en) === 'Booked by organizer',
  'MANUAL court',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'MANUAL', entityType: 'BAR' }, en) === 'Booked',
  'MANUAL bar',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'NONE' }, en) === 'Not booked',
  'NONE',
);
assert(
  formatGameBookingStatusLabel({ hasBookedCourt: true }, en) === 'Booked by organizer',
  'fallback hasBookedCourt',
);
assert(
  formatGameBookingStatusLabel({ hasBookedCourt: false }, en) === 'Not booked',
  'fallback not booked',
);

console.log('notification-base.booking-status.test.ts: all passed');
