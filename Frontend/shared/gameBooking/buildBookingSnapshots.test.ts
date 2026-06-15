import { describe, expect, it } from 'vitest';
import { booktimeIngestToStoredUtcIso } from '../booktime/localTime';
import { buildBookingSnapshots } from './buildBookingSnapshots';

const TZ = 'Europe/Belgrade';
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

  it('does not re-ingest afternoon stored UTC when timeZone is set', () => {
    const storedStart = booktimeIngestToStoredUtcIso('2026-06-15T18:00:00.000Z', TZ)!;
    const storedEnd = booktimeIngestToStoredUtcIso('2026-06-15T20:00:00.000Z', TZ)!;
    expect(storedStart).toBe('2026-06-15T16:00:00.000Z');
    expect(storedEnd).toBe('2026-06-15T18:00:00.000Z');

    const snapshots = buildBookingSnapshots(
      [
        {
          uuid: 'booking-afternoon',
          bookingStart: storedStart,
          bookingEnd: storedEnd,
          bookingResourceId: 'ext-a',
        },
      ],
      courts,
      { timeZone: TZ },
    );
    expect(snapshots[0]?.bookingStart).toBe('2026-06-15T16:00:00.000Z');
    expect(snapshots[0]?.bookingEnd).toBe('2026-06-15T18:00:00.000Z');
  });
});
