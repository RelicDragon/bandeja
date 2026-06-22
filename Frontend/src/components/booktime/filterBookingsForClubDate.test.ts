import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import {
  bookingOccursOnClubDate,
  filterBookingsForClubDate,
} from './filterBookingsForClubDate';

const belgradeClub = {
  id: 'club-1',
  city: { timezone: 'Europe/Belgrade' },
} as Club;

describe('filterBookingsForClubDate', () => {
  it('keeps bookings on the selected club calendar day', () => {
    const bookings = [
      { uuid: 'a', bookingStart: '2026-06-14T16:00:00.000Z', bookingEnd: '2026-06-14T17:00:00.000Z' },
      { uuid: 'b', bookingStart: '2026-06-15T16:00:00.000Z', bookingEnd: '2026-06-15T17:00:00.000Z' },
    ];
    const selectedDate = new Date('2026-06-14T12:00:00.000Z');
    expect(filterBookingsForClubDate(bookings, selectedDate, belgradeClub).map((b) => b.uuid)).toEqual([
      'a',
    ]);
  });

  it('matches using club timezone boundaries', () => {
    const booking = {
      uuid: 'late',
      bookingStart: '2026-06-14T22:30:00.000Z',
      bookingEnd: '2026-06-14T23:30:00.000Z',
    };
    const selectedDate = new Date('2026-06-15T00:00:00.000Z');
    expect(bookingOccursOnClubDate(booking, selectedDate, belgradeClub)).toBe(true);
  });
});
