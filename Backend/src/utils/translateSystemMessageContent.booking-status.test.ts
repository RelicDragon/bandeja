import { translateSystemMessageContent } from './translateSystemMessageContent';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const booked = translateSystemMessageContent(
  {
    content: JSON.stringify({
      type: 'GAME_BOOKING_STATUS_CHANGED',
      variables: { bookingStatus: 'MANUAL' },
      text: 'Court booking status changed to MANUAL',
    }),
  },
  'en',
);

assert(
  booked === 'Court booking status changed to Court booked',
  `booked got: ${booked}`,
);

const unbooked = translateSystemMessageContent(
  {
    content: JSON.stringify({
      type: 'GAME_BOOKING_STATUS_CHANGED',
      variables: { bookingStatus: 'NONE' },
      text: 'Court booking status changed to NONE',
    }),
  },
  'en',
);

assert(
  unbooked === 'Court booking status changed to Not booked yet',
  `unbooked got: ${unbooked}`,
);

const full = translateSystemMessageContent(
  {
    content: JSON.stringify({
      type: 'GAME_BOOKING_STATUS_CHANGED',
      variables: { bookingStatus: 'EXTERNAL_FULL' },
      text: 'Court booking status changed to EXTERNAL_FULL',
    }),
  },
  'en',
);

assert(
  full === 'Court booking status changed to Fully booked',
  `full got: ${full}`,
);

const bar = translateSystemMessageContent(
  {
    content: JSON.stringify({
      type: 'GAME_BOOKING_STATUS_CHANGED',
      variables: { bookingStatus: 'MANUAL' },
      text: 'Court booking status changed to MANUAL',
    }),
  },
  'en',
  'BAR',
);

assert(
  bar === 'Hall booking status changed to Hall booked',
  `bar got: ${bar}`,
);

console.log('translateSystemMessageContent.booking-status.test.ts: all passed');
