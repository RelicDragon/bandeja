import { describe, expect, it } from 'vitest';
import type { Game } from '../../src/types';
import { booktimeIngestToStoredUtcIso, booktimeWireFormatToStoredUtcIso, storedUtcIsoToInstant } from '../booktime/localTime';
import {
  bookingMatchesGameSlot,
  buildCreateGameDeepLinkParams,
  buildLinkBookingRequest,
  filterLinkableGames,
  isRecommendedLinkTarget,
  linkedGamesBookingGroupOccupancyPercent,
  linkedGamesBookingGroupSlotSegments,
  linkedGamesBookingSlotOccupancyPercent,
  linkedGamesBookingSlotSegments,
  linkedGamesFullyCoverBookingSlot,
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

function bookingInstantMs(iso: string) {
  const normalized = booktimeWireFormatToStoredUtcIso(iso, TZ) ?? iso;
  return storedUtcIsoToInstant(normalized)?.getTime() ?? null;
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

  it('derives courtId from booking resource when explicit courtId is omitted', () => {
    const booking = {
      uuid: 'booking-1',
      bookingStart: '2026-06-19T09:00:00.000Z',
      bookingEnd: '2026-06-19T10:00:00.000Z',
      bookingResource: { id: 'ext-a' },
    };
    const game = {
      id: 'game-1',
      timeIsSet: false,
      clubId: null,
      courtId: null,
    };
    const body = buildLinkBookingRequest(game, booking, club);
    expect(body.snapshot.courtId).toBe('court-a');
    expect(body.gamePatch?.courtId).toBe('court-a');
    expect(body.gamePatch?.clubId).toBe('club-1');
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

describe('linkedGamesFullyCoverBookingSlot', () => {
  it('returns true when one linked game matches the full slot', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(linkedGamesFullyCoverBookingSlot(booking, [game], TZ)).toBe(true);
  });

  it('returns true when multiple linked games cover the slot without gaps', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const startMs = bookingInstantMs(booking.bookingStart)!;
    const endMs = bookingInstantMs(booking.bookingEnd)!;
    const midIso = new Date(startMs + (endMs - startMs) / 2).toISOString();
    expect(
      linkedGamesFullyCoverBookingSlot(
        booking,
        [
          {
            timeIsSet: true,
            startTime: booking.bookingStart,
            endTime: midIso,
          },
          {
            timeIsSet: true,
            startTime: midIso,
            endTime: booking.bookingEnd,
          },
        ],
        TZ,
      ),
    ).toBe(true);
  });

  it('returns false when linked games leave part of the slot uncovered', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const startMs = bookingInstantMs(booking.bookingStart)!;
    const endMs = bookingInstantMs(booking.bookingEnd)!;
    const midIso = new Date(startMs + (endMs - startMs) / 2).toISOString();
    expect(
      linkedGamesFullyCoverBookingSlot(
        booking,
        [
          {
            timeIsSet: true,
            startTime: booking.bookingStart,
            endTime: midIso,
          },
        ],
        TZ,
      ),
    ).toBe(false);
  });

  it('returns 100 for a single linked game without usable time fields', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(linkedGamesFullyCoverBookingSlot(booking, [{ startTime: '', endTime: null }], TZ)).toBe(true);
  });
});

describe('linkedGamesBookingSlotOccupancyPercent', () => {
  it('returns 100 for a full-slot linked game', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(linkedGamesBookingSlotOccupancyPercent(booking, [game], TZ)).toBe(100);
  });

  it('returns 50 for half-slot coverage', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const startMs = bookingInstantMs(booking.bookingStart)!;
    const endMs = bookingInstantMs(booking.bookingEnd)!;
    const midIso = new Date(startMs + (endMs - startMs) / 2).toISOString();
    expect(
      linkedGamesBookingSlotOccupancyPercent(
        booking,
        [
          {
            timeIsSet: true,
            startTime: booking.bookingStart,
            endTime: midIso,
          },
        ],
        TZ,
      ),
    ).toBe(50);
  });

  it('matches real UTC game times against booktime stored booking slot', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(
      linkedGamesBookingSlotOccupancyPercent(
        booking,
        [
          {
            timeIsSet: true,
            startTime: '2026-06-19T07:00:00.000Z',
            endTime: '2026-06-19T08:00:00.000Z',
          },
        ],
        TZ,
      ),
    ).toBe(100);
  });

  it('uses link snapshot times for occupancy on the booking slot', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(
      linkedGamesBookingSlotOccupancyPercent(
        booking,
        [
          {
            startTime: '2026-06-19T10:00:00.000Z',
            endTime: '2026-06-19T11:00:00.000Z',
            linkBookingStart: '2026-06-19T07:00:00.000Z',
            linkBookingEnd: '2026-06-19T08:00:00.000Z',
          },
        ],
        TZ,
      ),
    ).toBe(100);
  });

  it('returns 100 when a link exists but game times do not overlap', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(
      linkedGamesBookingSlotOccupancyPercent(
        booking,
        [{ startTime: '2026-06-20T07:00:00.000Z', endTime: '2026-06-20T08:00:00.000Z' }],
        TZ,
      ),
    ).toBe(100);
  });
});

describe('linkedGamesBookingGroupOccupancyPercent', () => {
  it('weights occupancy across all bookings in the group', () => {
    const first = { ...normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'), uuid: 'booking-1' };
    const second = { ...normalizeBooking('2026-06-19T10:00:00.000Z', '2026-06-19T11:00:00.000Z'), uuid: 'booking-2' };
    const fullGame = gameWithSlot(first.bookingStart, first.bookingEnd);
    expect(
      linkedGamesBookingGroupOccupancyPercent(
        [first, second],
        new Map([
          [first.uuid, [fullGame]],
          [second.uuid, []],
        ]),
        TZ,
      ),
    ).toBe(50);
  });
});

describe('linkedGamesBookingSlotSegments', () => {
  it('returns two full segments for a fully linked hour', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(linkedGamesBookingSlotSegments(booking, [game], TZ)).toEqual(['full', 'full']);
  });

  it('returns partial then empty for half-slot coverage', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const startMs = bookingInstantMs(booking.bookingStart)!;
    const endMs = bookingInstantMs(booking.bookingEnd)!;
    const midIso = new Date(startMs + (endMs - startMs) / 2).toISOString();
    expect(
      linkedGamesBookingSlotSegments(
        booking,
        [{ timeIsSet: true, startTime: booking.bookingStart, endTime: midIso }],
        TZ,
      ),
    ).toEqual(['partial', 'empty']);
  });

  it('marks overlapping games as overlap in the same segment', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = gameWithSlot('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(linkedGamesBookingSlotSegments(booking, [game, game], TZ)).toEqual(['overlap', 'overlap']);
  });

  it('returns partial for a single game covering part of one segment', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const startMs = bookingInstantMs(booking.bookingStart)!;
    const quarterIso = new Date(startMs + 15 * 60 * 1000).toISOString();
    expect(
      linkedGamesBookingSlotSegments(
        booking,
        [{ timeIsSet: true, startTime: booking.bookingStart, endTime: quarterIso }],
        TZ,
      ),
    ).toEqual(['partial', 'empty']);
  });

  it('returns all full when a link exists but game times do not overlap', () => {
    const booking = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    expect(
      linkedGamesBookingSlotSegments(
        booking,
        [{ startTime: '2026-06-20T07:00:00.000Z', endTime: '2026-06-20T08:00:00.000Z' }],
        TZ,
      ),
    ).toEqual(['full', 'full']);
  });
});

describe('linkedGamesBookingGroupSlotSegments', () => {
  it('shows full then empty across adjacent bookings', () => {
    const first = { ...normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'), uuid: 'booking-1' };
    const second = { ...normalizeBooking('2026-06-19T10:00:00.000Z', '2026-06-19T11:00:00.000Z'), uuid: 'booking-2' };
    const fullGame = gameWithSlot(first.bookingStart, first.bookingEnd);
    expect(
      linkedGamesBookingGroupSlotSegments(
        [first, second],
        new Map([
          [first.uuid, [fullGame]],
          [second.uuid, []],
        ]),
        TZ,
      ),
    ).toEqual(['partial', 'partial', 'empty', 'empty']);
  });

  it('shows all full when every booking in the group is linked', () => {
    const first = { ...normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'), uuid: 'booking-1' };
    const second = { ...normalizeBooking('2026-06-19T10:00:00.000Z', '2026-06-19T11:00:00.000Z'), uuid: 'booking-2' };
    const firstGame = gameWithSlot(first.bookingStart, first.bookingEnd);
    const secondGame = gameWithSlot(second.bookingStart, second.bookingEnd);
    expect(
      linkedGamesBookingGroupSlotSegments(
        [first, second],
        new Map([
          [first.uuid, [firstGame]],
          [second.uuid, [secondGame]],
        ]),
        TZ,
      ),
    ).toEqual(['full', 'full', 'full', 'full']);
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

  it('joins multiple booking ids for multi-court deep link', () => {
    const first = normalizeBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const second = { ...first, uuid: 'booking-2', bookingStart: '2026-06-19T09:00:00.000Z', bookingEnd: '2026-06-19T10:00:00.000Z' };
    const params = buildCreateGameDeepLinkParams('club-1', [first, second], 'court-a');
    expect(params.bookingIds).toBe('booking-1,booking-2');
    expect(params.startTime).toBeTruthy();
    expect(params.endTime).toBeTruthy();
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
