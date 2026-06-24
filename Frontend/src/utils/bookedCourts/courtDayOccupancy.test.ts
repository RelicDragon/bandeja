import { describe, expect, it } from 'vitest';
import type { BookedCourtSlot, Club, Court } from '@/types';
import { computeCourtDayOccupancy } from './courtDayOccupancy';

const club = {
  openingTime: '08:00',
  closingTime: '22:00',
  defaultSlotMinutes: 60,
  city: { timezone: 'Europe/Belgrade' },
} as Club;

const courts = [{ id: 'court-1', name: 'Court 1' }] as Court[];

function booking(courtId: string, start: string, end: string): BookedCourtSlot {
  return {
    courtId,
    startTime: start,
    endTime: end,
  } as BookedCourtSlot;
}

describe('computeCourtDayOccupancy', () => {
  it('uses the full day for non-today dates', () => {
    const selectedDate = new Date('2026-06-25T10:00:00Z');
    const referenceNow = new Date('2026-06-24T15:00:00Z');
    const result = computeCourtDayOccupancy(
      courts,
      [booking('court-1', '2026-06-25T08:00:00+02:00', '2026-06-25T12:00:00+02:00')],
      club,
      selectedDate,
      referenceNow,
    );

    expect(result.get('court-1')).toEqual({
      bookedSlots: 4,
      totalSlots: 14,
      fillPercent: 29,
    });
  });

  it('ignores past slots when calculating today occupancy', () => {
    const selectedDate = new Date('2026-06-24T10:00:00Z');
    const referenceNow = new Date('2026-06-24T13:00:00Z');
    const result = computeCourtDayOccupancy(
      courts,
      [
        booking('court-1', '2026-06-24T08:00:00+02:00', '2026-06-24T12:00:00+02:00'),
        booking('court-1', '2026-06-24T17:00:00+02:00', '2026-06-24T18:00:00+02:00'),
      ],
      club,
      selectedDate,
      referenceNow,
    );

    expect(result.get('court-1')).toEqual({
      bookedSlots: 1,
      totalSlots: 6,
      fillPercent: 17,
    });
  });
});
