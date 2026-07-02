import { describe, expect, it } from 'vitest';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { pruneSelectedBookingsToAvailable } from './pruneSelectedBookingsToAvailable';

const limits = {
  min: 1,
  max: 2,
  requiredCourts: 1,
  playersPerCourt: 4,
};

function booking(uuid: string): BooktimeBookingRecord {
  return { uuid, bookingStart: '', bookingEnd: '' } as BooktimeBookingRecord;
}

describe('pruneSelectedBookingsToAvailable', () => {
  it('returns null when selected bookings are still available', () => {
    expect(
      pruneSelectedBookingsToAvailable({
        selectedBookingIds: ['booking-a'],
        availableBookings: [booking('booking-a')],
        selectionLimits: limits,
      }),
    ).toBeNull();
  });

  it('removes a selected booking that no longer matches the selected court/date', () => {
    expect(
      pruneSelectedBookingsToAvailable({
        selectedBookingIds: ['booking-b'],
        availableBookings: [booking('booking-a')],
        selectionLimits: limits,
      }),
    ).toEqual({ ids: [], records: [] });
  });

  it('keeps remaining available selected bookings', () => {
    expect(
      pruneSelectedBookingsToAvailable({
        selectedBookingIds: ['booking-a', 'booking-b'],
        availableBookings: [booking('booking-a')],
        selectionLimits: limits,
      }),
    ).toEqual({ ids: ['booking-a'], records: [booking('booking-a')] });
  });
});
