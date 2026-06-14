import { describe, expect, it } from 'vitest';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { groupAdjacentBooktimeBookings } from './groupAdjacentBooktimeBookings';

type Booking = BooktimeBookingRecord & { clubId: string };

function booking(
  uuid: string,
  start: string,
  end: string,
  resourceId: string,
  clubId = 'club-a',
): Booking {
  return {
    uuid,
    bookingStart: start,
    bookingEnd: end,
    bookingResourceId: resourceId,
    clubId,
  };
}

describe('groupAdjacentBooktimeBookings', () => {
  it('returns singles when slots are not adjacent', () => {
    const bookings = [
      booking('1', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-1'),
      booking('2', '2026-06-15T12:00:00.000Z', '2026-06-15T13:00:00.000Z', 'court-1'),
    ];
    expect(groupAdjacentBooktimeBookings(bookings, { clubIdOf: (b) => b.clubId })).toEqual([
      { kind: 'single', booking: bookings[0] },
      { kind: 'single', booking: bookings[1] },
    ]);
  });

  it('groups consecutive slots on the same court', () => {
    const bookings = [
      booking('1', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-1'),
      booking('2', '2026-06-15T11:00:00.000Z', '2026-06-15T12:00:00.000Z', 'court-1'),
      booking('3', '2026-06-15T12:00:00.000Z', '2026-06-15T13:00:00.000Z', 'court-1'),
    ];
    expect(groupAdjacentBooktimeBookings(bookings, { clubIdOf: (b) => b.clubId })).toEqual([
      { kind: 'group', bookings },
    ]);
  });

  it('does not group adjacent slots on different courts', () => {
    const bookings = [
      booking('1', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-1'),
      booking('2', '2026-06-15T11:00:00.000Z', '2026-06-15T12:00:00.000Z', 'court-2'),
    ];
    expect(groupAdjacentBooktimeBookings(bookings, { clubIdOf: (b) => b.clubId })).toEqual([
      { kind: 'single', booking: bookings[0] },
      { kind: 'single', booking: bookings[1] },
    ]);
  });

  it('does not group adjacent slots across clubs', () => {
    const bookings = [
      booking('1', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-1', 'club-a'),
      booking('2', '2026-06-15T11:00:00.000Z', '2026-06-15T12:00:00.000Z', 'court-1', 'club-b'),
    ];
    expect(groupAdjacentBooktimeBookings(bookings, { clubIdOf: (b) => b.clubId })).toEqual([
      { kind: 'single', booking: bookings[0] },
      { kind: 'single', booking: bookings[1] },
    ]);
  });

  it('groups adjacent slots even when another club sits between them in the feed order', () => {
    const slotA1 = booking('1', '2026-06-15T10:00:00.000Z', '2026-06-15T11:00:00.000Z', 'court-1', 'club-a');
    const slotB = booking('2', '2026-06-15T10:30:00.000Z', '2026-06-15T11:30:00.000Z', 'court-1', 'club-b');
    const slotA2 = booking('3', '2026-06-15T11:00:00.000Z', '2026-06-15T12:00:00.000Z', 'court-1', 'club-a');
    const bookings = [slotA1, slotB, slotA2];

    expect(groupAdjacentBooktimeBookings(bookings, { clubIdOf: (b) => b.clubId })).toEqual([
      { kind: 'group', bookings: [slotA1, slotA2] },
      { kind: 'single', booking: slotB },
    ]);
  });
});
