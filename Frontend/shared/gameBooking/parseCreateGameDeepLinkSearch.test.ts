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

// PRD 354 — the public club page links court chips to
// `/create-game?clubId=&courtId=&date=`.
describe('date prefill (PRD 354)', () => {
  it('parses a yyyy-MM-dd date param', () => {
    const parsed = parseCreateGameDeepLinkSearch('?clubId=c1&courtId=court-3&date=2026-09-20');
    expect(parsed.clubId).toBe('c1');
    expect(parsed.courtId).toBe('court-3');
    expect(parsed.date).toBe('2026-09-20');
  });

  it('drops a malformed or impossible date rather than seeding an Invalid Date', () => {
    expect(parseCreateGameDeepLinkSearch('?date=20-09-2026').date).toBeUndefined();
    expect(parseCreateGameDeepLinkSearch('?date=2026-13-01').date).toBeUndefined();
    expect(parseCreateGameDeepLinkSearch('?date=2026-02-30').date).toBeUndefined();
    expect(parseCreateGameDeepLinkSearch('?date=').date).toBeUndefined();
    expect(parseCreateGameDeepLinkSearch('?clubId=c1').date).toBeUndefined();
  });

  it('seeds startTime at local noon so the wizard pins the tapped day', () => {
    const { gameData, date } = createGameDataFromDeepLinkSearch(
      '?clubId=c1&courtId=court-3&date=2026-09-20',
    );
    expect(date).toBe('2026-09-20');
    const seeded = new Date(gameData.startTime as string);
    expect(seeded.getFullYear()).toBe(2026);
    expect(seeded.getMonth()).toBe(8);
    expect(seeded.getDate()).toBe(20);
    expect(seeded.getHours()).toBe(12);
  });

  it('never overrides an explicit startTime', () => {
    const { gameData } = createGameDataFromDeepLinkSearch(
      '?clubId=c1&date=2026-09-20&startTime=t1&endTime=t2',
    );
    expect(gameData.startTime).toBe('t1');
    expect(gameData.endTime).toBe('t2');
  });
});
