import { describe, expect, it } from 'vitest';
import type { Game } from '../../src/types';
import { booktimeIngestToStoredUtcIso } from '../booktime/localTime';
import {
  bookingMatchesGameSlot,
  buildCreateGameDeepLinkParams,
  buildLinkBookingRequest,
  filterLinkableGames,
  isRecommendedLinkTarget,
  resolveBooktimeClubTimezone,
  sortLinkableGames,
} from './linkBookingToGame';

const TZ = 'Europe/Belgrade';

const club = {
  clubId: 'club-1',
  courts: [{ id: 'court-a', externalCourtId: 'ext-a' }],
};

function normalizeBooking(start: string, end: string) {
  return {
    uuid: 'booking-1',
    bookingStart: booktimeIngestToStoredUtcIso(start, TZ)!,
    bookingEnd: booktimeIngestToStoredUtcIso(end, TZ)!,
    bookingResourceId: 'ext-a',
  };
}

function gameWithSlot(start: string, end: string): Game {
  const booking = normalizeBooking(start, end);
  return {
    id: 'game-1',
    entityType: 'GAME',
    status: 'ANNOUNCED',
    timeIsSet: true,
    startTime: booking.bookingStart,
    endTime: booking.bookingEnd,
    clubId: 'club-1',
    participants: [{ userId: 'user-1', role: 'OWNER' }],
    city: { timezone: TZ },
  } as Game;
}

describe('resolveBooktimeClubTimezone', () => {
  it('defaults Booktime club rows to Belgrade', () => {
    expect(resolveBooktimeClubTimezone({ club })).toBe(TZ);
  });

  it('prefers explicit timezone', () => {
    expect(resolveBooktimeClubTimezone({ club, explicit: 'UTC' })).toBe('UTC');
  });
});

describe('bookingMatchesGameSlot', () => {
  it('matches after ingest normalization', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(bookingMatchesGameSlot(booking, game, TZ)).toBe(true);
    expect(isRecommendedLinkTarget(game, booking, TZ)).toBe(true);
  });

  it('returns false when game time is unset', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(bookingMatchesGameSlot(booking, { timeIsSet: false }, TZ)).toBe(false);
  });
});

describe('sortLinkableGames', () => {
  it('puts slot-matching games first sorted by start time', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const matchLater = {
      ...gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
      id: 'match-later',
      startTime: booking.bookingStart,
      endTime: booking.bookingEnd,
    };
    const matchEarlier = {
      ...matchLater,
      id: 'match-earlier',
      startTime: '2026-06-20T07:00:00.000Z',
      endTime: '2026-06-20T08:00:00.000Z',
      timeIsSet: false,
    };
    const other = {
      ...matchLater,
      id: 'other',
      startTime: '2026-06-21T07:00:00.000Z',
      endTime: '2026-06-21T08:00:00.000Z',
    };
    const sorted = sortLinkableGames([other, matchLater, matchEarlier], booking, TZ);
    expect(sorted.map((g) => g.id)).toEqual(['match-later', 'match-earlier', 'other']);
  });
});

describe('filterLinkableGames', () => {
  it('keeps announced owner games with unset or future times', () => {
    const future = gameWithSlot('2035-06-19T09:00:00.000Z', '2035-06-19T10:00:00.000Z');
    const past = {
      ...future,
      startTime: '2020-06-19T07:00:00.000Z',
      endTime: '2020-06-19T08:00:00.000Z',
    };
    const unset = { ...future, timeIsSet: false };
    const filtered = filterLinkableGames([future, past, unset], 'user-1');
    expect(filtered.map((g) => g.timeIsSet)).toEqual([true, false]);
  });
});

describe('buildLinkBookingRequest', () => {
  it('builds snapshot and game patch for mismatched slot', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = {
      id: 'game-1',
      timeIsSet: true,
      startTime: '2026-06-20T07:00:00.000Z',
      endTime: '2026-06-20T08:00:00.000Z',
      clubId: 'other-club',
    };
    const body = buildLinkBookingRequest(game, booking, club, { courtId: 'court-a' });
    expect(body.externalBookingId).toBe('booking-1');
    expect(body.snapshot).toEqual({
      externalBookingId: 'booking-1',
      courtId: 'court-a',
      bookingStart: booking.bookingStart,
      bookingEnd: booking.bookingEnd,
    });
    expect(body.gamePatch).toEqual({
      hasBookedCourt: true,
      clubId: 'club-1',
      courtId: 'court-a',
      startTime: booking.bookingStart,
      endTime: booking.bookingEnd,
      timeIsSet: true,
    });
  });

  it('skips datetime patch when requested', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = {
      timeIsSet: true,
      startTime: '2026-06-20T07:00:00.000Z',
      endTime: '2026-06-20T08:00:00.000Z',
    };
    const body = buildLinkBookingRequest(game, booking, club, { skipGameDatetimePatch: true });
    expect(body.gamePatch?.startTime).toBeUndefined();
    expect(body.gamePatch?.hasBookedCourt).toBe(true);
  });
});

describe('buildCreateGameDeepLinkParams', () => {
  it('normalizes booking times for create-game deep link', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const params = buildCreateGameDeepLinkParams('club-1', booking, 'court-a');
    expect(params.locationTimeMode).toBe('bookings');
    expect(params.bookingIds).toBe('booking-1');
    expect(params.startTime).toBe(booking.bookingStart);
    expect(params.endTime).toBe(booking.bookingEnd);
    expect(params.courtId).toBe('court-a');
  });

  it('keeps afternoon stored UTC for create-game deep link', () => {
    const booking = normalizeBooking('2026-06-15T18:00:00.000Z', '2026-06-15T20:00:00.000Z');
    expect(booking.bookingStart).toBe('2026-06-15T16:00:00.000Z');
    expect(booking.bookingEnd).toBe('2026-06-15T18:00:00.000Z');
    const params = buildCreateGameDeepLinkParams('club-1', booking, 'court-a');
    expect(params.startTime).toBe('2026-06-15T16:00:00.000Z');
    expect(params.endTime).toBe('2026-06-15T18:00:00.000Z');
  });
});

describe('buildLinkBookingRequest afternoon stored UTC', () => {
  it('keeps afternoon stored UTC in snapshot and game patch', () => {
    const booking = normalizeBooking('2026-06-15T18:00:00.000Z', '2026-06-15T20:00:00.000Z');
    const game = {
      id: 'game-1',
      timeIsSet: true,
      startTime: '2026-06-20T07:00:00.000Z',
      endTime: '2026-06-20T08:00:00.000Z',
      clubId: 'other-club',
    };
    const body = buildLinkBookingRequest(game, booking, club, { courtId: 'court-a' });
    expect(body.snapshot.bookingStart).toBe('2026-06-15T16:00:00.000Z');
    expect(body.snapshot.bookingEnd).toBe('2026-06-15T18:00:00.000Z');
    expect(body.gamePatch?.startTime).toBe('2026-06-15T16:00:00.000Z');
    expect(body.gamePatch?.endTime).toBe('2026-06-15T18:00:00.000Z');
  });
});
