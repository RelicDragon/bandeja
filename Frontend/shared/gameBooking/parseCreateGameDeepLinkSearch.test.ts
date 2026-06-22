import { describe, expect, it } from 'vitest';
import {
  createGameDataFromDeepLinkSearch,
  parseBookingIdsParam,
  parseCreateGameDeepLinkSearch,
} from './parseCreateGameDeepLinkSearch';

describe('parseBookingIdsParam', () => {
  it('parses comma-separated ids', () => {
    expect(parseBookingIdsParam('a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array for null', () => {
    expect(parseBookingIdsParam(null)).toEqual([]);
  });
});

describe('parseCreateGameDeepLinkSearch', () => {
  it('parses unified deep link without deprecated tab mode', () => {
    const parsed = parseCreateGameDeepLinkSearch(
      'clubId=club-1&bookingIds=uuid-1&startTime=2026-06-19T09:00:00.000Z&hasBookedCourt=1',
    );
    expect(parsed.clubId).toBe('club-1');
    expect(parsed.bookingIds).toEqual(['uuid-1']);
    expect(parsed.startTime).toBe('2026-06-19T09:00:00.000Z');
    expect(parsed.hasBookedCourt).toBe(true);
    expect(parsed.locationTimeMode).toBeUndefined();
  });

  it('keeps backward-compatible locationTimeMode=bookings', () => {
    const parsed = parseCreateGameDeepLinkSearch(
      'locationTimeMode=bookings&bookingIds=uuid-1,uuid-2&clubId=club-1',
    );
    expect(parsed.locationTimeMode).toBe('bookings');
    expect(parsed.bookingIds).toEqual(['uuid-1', 'uuid-2']);
  });
});

describe('createGameDataFromDeepLinkSearch', () => {
  it('maps search params to initial game data and booking ids', () => {
    const { gameData, bookingIds } = createGameDataFromDeepLinkSearch(
      '?clubId=club-1&courtId=court-a&bookingIds=b1&startTime=t1&endTime=t2&hasBookedCourt=1',
    );
    expect(gameData).toEqual({
      clubId: 'club-1',
      courtId: 'court-a',
      startTime: 't1',
      endTime: 't2',
      hasBookedCourt: true,
    });
    expect(bookingIds).toEqual(['b1']);
  });
});
