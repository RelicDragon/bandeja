import { describe, expect, it } from 'vitest';
import { booktimeIngestToStoredUtcIso } from '../../shared/booktime/localTime';
import {
  resolveUnlinkedMyTabBookings,
  seedLinkedGamesFromMyGames,
} from './unlinkedMyTabBookings';

const TZ = 'Europe/Belgrade';

function booking(uuid: string, start: string, end: string) {
  return {
    uuid,
    bookingStart: booktimeIngestToStoredUtcIso(start, TZ)!,
    bookingEnd: booktimeIngestToStoredUtcIso(end, TZ)!,
  };
}

const open = booking('open', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
const covered = booking('full', '2026-06-19T12:00:00.000Z', '2026-06-19T13:00:00.000Z');

describe('seedLinkedGamesFromMyGames', () => {
  it('indexes games by linked booking id', () => {
    const map = seedLinkedGamesFromMyGames([
      {
        id: 'game-1',
        name: 'Friday',
        startTime: covered.bookingStart,
        endTime: covered.bookingEnd,
        timeIsSet: true,
        status: 'ANNOUNCED',
        linkedBookings: [{ id: 'l1', externalBookingId: 'full', externalBookingProvider: 'BOOKTIME' }],
      },
    ]);
    expect(map.get('full')?.[0]?.id).toBe('game-1');
    expect(map.get('open')).toBeUndefined();
  });
});

describe('resolveUnlinkedMyTabBookings', () => {
  const tz = () => TZ;

  it('stays pending while bookings load', () => {
    expect(
      resolveUnlinkedMyTabBookings({
        bookings: [],
        bookingsLoading: true,
        seedByBookingId: new Map(),
        apiByBookingId: new Map(),
        apiError: false,
        apiLoading: false,
        timeZoneOf: tz,
      }),
    ).toEqual({ bookings: [], visible: false, pending: true });
  });

  it('hides seed-fully-linked bookings without waiting for API', () => {
    const seed = seedLinkedGamesFromMyGames([
      {
        id: 'game-1',
        name: 'Friday',
        startTime: covered.bookingStart,
        endTime: covered.bookingEnd,
        timeIsSet: true,
        status: 'ANNOUNCED',
        linkedBookings: [
          {
            id: 'l1',
            externalBookingId: 'full',
            externalBookingProvider: 'BOOKTIME',
            bookingStart: covered.bookingStart,
            bookingEnd: covered.bookingEnd,
          },
        ],
      },
    ]);
    const result = resolveUnlinkedMyTabBookings({
      bookings: [covered],
      bookingsLoading: false,
      seedByBookingId: seed,
      apiByBookingId: new Map(),
      apiError: false,
      apiLoading: true,
      timeZoneOf: tz,
    });
    expect(result).toEqual({ bookings: [], visible: false, pending: false });
  });

  it('does not flash an unlinked card until API confirms', () => {
    const result = resolveUnlinkedMyTabBookings({
      bookings: [open],
      bookingsLoading: false,
      seedByBookingId: new Map(),
      apiByBookingId: new Map(),
      apiError: false,
      apiLoading: true,
      timeZoneOf: tz,
    });
    expect(result.visible).toBe(false);
    expect(result.pending).toBe(true);
  });

  it('shows unlinked only after API confirms no full coverage', () => {
    const result = resolveUnlinkedMyTabBookings({
      bookings: [open, covered],
      bookingsLoading: false,
      seedByBookingId: new Map(),
      apiByBookingId: new Map([
        ['open', []],
        ['full', [{ startTime: covered.bookingStart, endTime: covered.bookingEnd, timeIsSet: true }]],
      ]),
      apiError: false,
      apiLoading: false,
      timeZoneOf: tz,
    });
    expect(result.visible).toBe(true);
    expect(result.pending).toBe(false);
    expect(result.bookings.map((b) => b.uuid)).toEqual(['open']);
  });

  it('does not treat API failure as unlinked', () => {
    const result = resolveUnlinkedMyTabBookings({
      bookings: [open],
      bookingsLoading: false,
      seedByBookingId: new Map(),
      apiByBookingId: new Map(),
      apiError: true,
      apiLoading: false,
      timeZoneOf: tz,
    });
    expect(result).toEqual({ bookings: [], visible: false, pending: false });
  });
});
