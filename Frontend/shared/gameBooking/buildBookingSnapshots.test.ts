import { describe, expect, it } from 'vitest';
import { buildBookingSnapshots } from './buildBookingSnapshots';
const courts = [
  {
    id: 'court-a',
    name: 'Court A',
    clubId: 'club-1',
    isIndoor: false,
    externalCourtId: 'ext-a',
  },
  {
    id: 'court-b',
    name: 'Court B',
    clubId: 'club-1',
    isIndoor: false,
    externalCourtId: 'ext-b',
  },
];

describe('buildBookingSnapshots', () => {
  it('maps court id and ISO times from bookings', () => {
    expect(
      buildBookingSnapshots(
        [
          {
            uuid: 'booking-1',
            bookingStart: '2026-06-12T10:00:00.000Z',
            bookingEnd: '2026-06-12T11:00:00.000Z',
            bookingResourceId: 'ext-a',
          },
          {
            uuid: 'booking-2',
            bookingStart: '2026-06-12T11:00:00.000Z',
            bookingEnd: '2026-06-12T12:00:00.000Z',
            bookingResource: { uuid: 'ext-b' },
          },
        ],
        courts,
      ),
    ).toEqual([
      {
        externalBookingId: 'booking-1',
        courtId: 'court-a',
        bookingStart: '2026-06-12T10:00:00.000Z',
        bookingEnd: '2026-06-12T11:00:00.000Z',
      },
      {
        externalBookingId: 'booking-2',
        courtId: 'court-b',
        bookingStart: '2026-06-12T11:00:00.000Z',
        bookingEnd: '2026-06-12T12:00:00.000Z',
      },
    ]);
  });
});
