import { describe, expect, it } from 'vitest';
import { syncFormScheduleFromBookings } from './syncFormScheduleFromBookings';
import type { Club, Court } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';

const club = {
  id: 'club-1',
  name: 'Test Club',
  city: { timezone: 'Europe/Belgrade' },
  courts: [],
} as Club;

const courts: Court[] = [
  {
    id: 'court-a',
    name: 'Court A',
    externalCourtId: 'ext-a',
    clubId: 'club-1',
  } as Court,
  {
    id: 'court-b',
    name: 'Court B',
    externalCourtId: 'ext-b',
    clubId: 'club-1',
  } as Court,
];

function booking(
  uuid: string,
  start: string,
  end: string,
  externalCourtId: string,
): BooktimeBookingRecord {
  return {
    uuid,
    bookingStart: start,
    bookingEnd: end,
    bookingResourceId: externalCourtId,
  } as BooktimeBookingRecord;
}

describe('syncFormScheduleFromBookings', () => {
  it('returns null when no bookings selected', () => {
    expect(
      syncFormScheduleFromBookings({
        selectedBookings: [],
        courts,
        club,
        timeOverride: false,
      }),
    ).toBeNull();
  });

  it('derives date, time, duration, and court ids from single booking', () => {
    const result = syncFormScheduleFromBookings({
      selectedBookings: [
        booking('b1', '2026-06-15T08:00:00.000Z', '2026-06-15T10:00:00.000Z', 'ext-a'),
      ],
      courts,
      club,
      timeOverride: false,
    });

    expect(result).not.toBeNull();
    expect(result!.courtIds).toEqual(['court-a']);
    expect(result!.durationHours).toBe(2);
    expect(result!.selectedTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('uses union window and unique courts for multi-court selection', () => {
    const result = syncFormScheduleFromBookings({
      selectedBookings: [
        booking('b1', '2026-06-15T08:00:00.000Z', '2026-06-15T10:00:00.000Z', 'ext-a'),
        booking('b2', '2026-06-15T09:00:00.000Z', '2026-06-15T11:00:00.000Z', 'ext-b'),
      ],
      courts,
      club,
      timeOverride: false,
    });

    expect(result).not.toBeNull();
    expect(result!.courtIds.sort()).toEqual(['court-a', 'court-b']);
    expect(result!.durationHours).toBe(3);
  });

  it('respects time override window', () => {
    const result = syncFormScheduleFromBookings({
      selectedBookings: [
        booking('b1', '2026-06-15T08:00:00.000Z', '2026-06-15T10:00:00.000Z', 'ext-a'),
      ],
      courts,
      club,
      timeOverride: true,
      overrideStartTime: '2026-06-15T08:30:00.000Z',
      overrideEndTime: '2026-06-15T09:30:00.000Z',
    });

    expect(result).not.toBeNull();
    expect(result!.durationHours).toBe(1);
  });
});
