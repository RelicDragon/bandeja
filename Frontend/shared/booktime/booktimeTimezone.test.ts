import { describe, expect, it } from 'vitest';
import { formatBooktimeBookingWhen, resolveBooktimeMyClubTimezone } from '../../src/components/booktime/booktimeBookingUtils';
import {
  booktimeIngestToStoredUtcIso,
  booktimeIsoToUtcIso,
  storedUtcIsoToInstant,
} from './localTime';
import { buildBookingSnapshots } from '../gameBooking/buildBookingSnapshots';
import { deriveGameTimeFromBookings } from '../gameBooking/deriveGameTimeFromBookings';
import { bookingMatchesGameSlot } from '@shared/gameBooking/linkBookingToGame';
import type { Game } from '../../src/types';
import { canCancelByPolicy } from '../../src/integrations/booktime/bookFlow';

const TZ = 'Europe/Belgrade';
const DISPLAY = { locale: 'ru-RU', hour12: false } as const;

function normalizeApiBooking(start: string, end: string) {
  return {
    uuid: 'test-booking',
    bookingStart: booktimeIngestToStoredUtcIso(start, TZ)!,
    bookingEnd: booktimeIngestToStoredUtcIso(end, TZ)!,
  };
}

function belgradeTime(iso: string): string {
  const d = storedUtcIsoToInstant(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

describe('booktime timezone pipeline', () => {
  it('converts fake-Z API wall clock to stored UTC once', () => {
    expect(booktimeIngestToStoredUtcIso('2026-06-15T18:00:00.000Z', TZ)).toBe(
      '2026-06-15T16:00:00.000Z',
    );
    expect(booktimeIngestToStoredUtcIso('2026-06-19T09:00:00.000Z', TZ)).toBe(
      '2026-06-19T07:00:00.000Z',
    );
  });

  it('does not double-convert stored UTC', () => {
    const stored = '2026-06-19T07:00:00.000Z';
    expect(booktimeIngestToStoredUtcIso(stored, TZ)).toBe(stored);
    expect(
      deriveGameTimeFromBookings(
        [{ bookingStart: stored, bookingEnd: '2026-06-19T08:00:00.000Z' }],
        { timeZone: TZ },
      ),
    ).toEqual({
      startTime: stored,
      endTime: '2026-06-19T08:00:00.000Z',
    });
  });

  it('does not shift afternoon stored UTC on re-parse', () => {
    const storedStart = booktimeIngestToStoredUtcIso('2026-06-15T18:00:00.000Z', TZ)!;
    const storedEnd = booktimeIngestToStoredUtcIso('2026-06-15T20:00:00.000Z', TZ)!;
    expect(storedStart).toBe('2026-06-15T16:00:00.000Z');
    expect(storedEnd).toBe('2026-06-15T18:00:00.000Z');
    expect(
      deriveGameTimeFromBookings(
        [{ bookingStart: storedStart, bookingEnd: storedEnd }],
        { timeZone: TZ },
      ),
    ).toEqual({ startTime: storedStart, endTime: storedEnd });
  });

  it('displays normalized UTC in Belgrade wall clock', () => {
    const booking = normalizeApiBooking('2026-06-15T18:00:00.000Z', '2026-06-15T20:00:00.000Z');
    const label = formatBooktimeBookingWhen(booking, { timezone: TZ, displaySettings: DISPLAY });
    expect(label).toContain('18:00');
    expect(label).toContain('20:00');
  });

  it('matches linked game slot after normalization', () => {
    const booking = normalizeApiBooking('2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z');
    const game = {
      timeIsSet: true,
      startTime: booking.bookingStart,
      endTime: booking.bookingEnd,
      city: { timezone: TZ },
    } as Game;
    expect(bookingMatchesGameSlot(booking, game, TZ)).toBe(true);
    expect(belgradeTime(game.startTime)).toBe('09:00');
  });

  it('uses stored UTC for cancel policy', () => {
    const storedStart = booktimeIngestToStoredUtcIso('2035-06-30T18:00:00.000Z', TZ)!;
    const farFuture = new Date('2030-01-01T00:00:00.000Z').getTime();
    const originalNow = Date.now;
    Date.now = () => farFuture;
    try {
      expect(canCancelByPolicy(storedStart, 24, TZ)).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  it('converts naive create-flow times only once', () => {
    const snapshots = buildBookingSnapshots(
      [{ uuid: 'b1', bookingStart: '2026-06-14T09:00', bookingEnd: '2026-06-14T10:00', bookingResourceId: 'ext-a' }],
      [{ id: 'court-a', externalCourtId: 'ext-a' }],
      { timeZone: TZ },
    );
    expect(snapshots[0]?.bookingStart).toBe('2026-06-14T07:00:00.000Z');
    expect(deriveGameTimeFromBookings(snapshots, { timeZone: TZ })).toEqual({
      startTime: '2026-06-14T07:00:00.000Z',
      endTime: '2026-06-14T08:00:00.000Z',
    });
  });

  it('parseBooktimeStoredOrNaive keeps stored UTC and converts naive', () => {
    expect(booktimeIngestToStoredUtcIso('2026-06-19T07:00:00.000Z', TZ)).toBe(
      '2026-06-19T07:00:00.000Z',
    );
    expect(booktimeIngestToStoredUtcIso('2026-06-14T09:00', TZ)).toBe('2026-06-14T07:00:00.000Z');
  });

  it('wire ingest then booktimeIsoToUtcIso does not double-shift afternoon stored UTC', () => {
    const stored = booktimeIngestToStoredUtcIso('2026-06-15T18:00:00.000Z', TZ)!;
    expect(stored).toBe('2026-06-15T16:00:00.000Z');
    expect(booktimeIsoToUtcIso(stored, TZ)).toBe(stored);
    expect(booktimeIngestToStoredUtcIso(stored, TZ)).not.toBe(stored);
  });
});

describe('resolveBooktimeMyClubTimezone', () => {
  it('uses club cityTimezone when set', () => {
    expect(resolveBooktimeMyClubTimezone({ cityTimezone: 'Europe/London' })).toBe('Europe/London');
  });

  it('falls back to Belgrade when cityTimezone is missing', () => {
    expect(resolveBooktimeMyClubTimezone({ cityTimezone: null })).toBe(TZ);
    expect(resolveBooktimeMyClubTimezone({})).toBe(TZ);
  });

  it('uses club.city.timezone when cityTimezone is absent', () => {
    expect(resolveBooktimeMyClubTimezone({ city: { timezone: 'Europe/London' } })).toBe('Europe/London');
  });
});
