import { describe, expect, it } from 'vitest';
import {
  bookingSlotSegmentsOccupancyPercent,
  linkedGamesBookingSlotOccupancyPercent,
  linkedGamesBookingSlotSegments,
  linkedGamesFullyCoverBookingSlot,
} from './linkBookingToGame';
import { booktimeIngestToStoredUtcIso } from '../booktime/localTime';

const TZ = 'Europe/Belgrade';

/** Exact prod game cmpa5zctf05fl65d3ai7nj16k shapes */
const prodBookingIngested = {
  uuid: 'f659d2da-1c77-4340-9ba1-914a3684b894',
  bookingStart: booktimeIngestToStoredUtcIso('2026-07-27T09:00:00.000Z', TZ)!,
  bookingEnd: booktimeIngestToStoredUtcIso('2026-07-27T11:00:00.000Z', TZ)!,
};
const prodGameApi = {
  timeIsSet: true,
  startTime: '2026-07-27T08:00:00.000Z',
  endTime: '2026-07-27T09:00:00.000Z',
  linkBookingStart: prodBookingIngested.bookingStart,
  linkBookingEnd: prodBookingIngested.bookingEnd,
};
const prodGameSeed = {
  timeIsSet: true,
  startTime: '2026-07-27T08:00:00.000Z',
  endTime: '2026-07-27T09:00:00.000Z',
};
const prodBookingFromGameApi = {
  uuid: 'f659d2da-1c77-4340-9ba1-914a3684b894',
  bookingStart: '2026-07-27T07:00:00.000Z',
  bookingEnd: '2026-07-27T09:00:00.000Z',
};

describe('no-surprise matrix', () => {
  it('My Bookings path (ingested + API linked games)', () => {
    const pct = linkedGamesBookingSlotOccupancyPercent(prodBookingIngested, [prodGameApi], TZ);
    const segs = linkedGamesBookingSlotSegments(prodBookingIngested, [prodGameApi], TZ);
    const tip = bookingSlotSegmentsOccupancyPercent(segs);
    expect(pct).toBe(50);
    expect(linkedGamesFullyCoverBookingSlot(prodBookingIngested, [prodGameApi], TZ)).toBe(false);
    expect(segs).toEqual(['empty', 'empty', 'partial', 'partial']);
    // pre-existing demotion: tooltip understates vs true occupancy
    expect(tip).toBe(25);
  });

  it('Game details seed path (Prisma booking + seed game, no link snapshot)', () => {
    expect(linkedGamesBookingSlotOccupancyPercent(prodBookingFromGameApi, [prodGameSeed], TZ)).toBe(50);
    expect(linkedGamesBookingSlotSegments(prodBookingFromGameApi, [prodGameSeed], TZ)).toEqual([
      'empty',
      'empty',
      'partial',
      'partial',
    ]);
  });

  it('Game details after fetch (Prisma booking + API linked games w/ full snapshot)', () => {
    const gameWithSnap = {
      ...prodGameSeed,
      linkBookingStart: prodBookingFromGameApi.bookingStart,
      linkBookingEnd: prodBookingFromGameApi.bookingEnd,
    };
    expect(linkedGamesBookingSlotOccupancyPercent(prodBookingFromGameApi, [gameWithSnap], TZ)).toBe(50);
  });

  it('raw wall booking + true UTC game (hostile)', () => {
    const booking = {
      uuid: 'b',
      bookingStart: '2026-07-27T09:00:00.000Z',
      bookingEnd: '2026-07-27T11:00:00.000Z',
    };
    const game = {
      timeIsSet: true,
      startTime: '2026-07-27T08:00:00.000Z',
      endTime: '2026-07-27T09:00:00.000Z',
      linkBookingStart: booking.bookingStart,
      linkBookingEnd: booking.bookingEnd,
    };
    expect(linkedGamesBookingSlotOccupancyPercent(booking, [game], TZ)).toBe(50);
  });

  it('old bug regressors: must not be 100 or empty', () => {
    const segsMy = linkedGamesBookingSlotSegments(prodBookingIngested, [prodGameApi], TZ);
    const segsGd = linkedGamesBookingSlotSegments(prodBookingFromGameApi, [prodGameSeed], TZ);
    expect(segsMy.every((s) => s === 'full')).toBe(false);
    expect(segsGd.every((s) => s === 'empty')).toBe(false);
    expect(segsMy.some((s) => s === 'empty')).toBe(true);
    expect(segsGd.some((s) => s !== 'empty')).toBe(true);
  });
});
