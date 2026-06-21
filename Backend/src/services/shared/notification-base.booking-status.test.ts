import { formatGameBookingStatusLabel } from './notification-base';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const en = 'en';

assert(
  formatGameBookingStatusLabel({ bookingStatus: 'EXTERNAL_FULL' }, en) === 'Fully booked',
  'EXTERNAL_FULL',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'EXTERNAL_PARTIAL' }, en) === 'Not fully booked',
  'EXTERNAL_PARTIAL',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'MANUAL' }, en) === 'Court booked',
  'MANUAL court',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'MANUAL', entityType: 'BAR' }, en) === 'Hall booked',
  'MANUAL bar',
);
assert(
  formatGameBookingStatusLabel({ bookingStatus: 'NONE' }, en) === 'Not booked yet',
  'NONE',
);
assert(
  formatGameBookingStatusLabel({ hasBookedCourt: true }, en) === 'Court booked',
  'fallback hasBookedCourt',
);
assert(
  formatGameBookingStatusLabel({ hasBookedCourt: false }, en) === 'Not booked yet',
  'fallback not booked',
);

console.log('notification-base.booking-status.test.ts: all passed');
