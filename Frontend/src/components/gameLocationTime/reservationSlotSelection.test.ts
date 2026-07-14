import { describe, expect, it } from 'vitest';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { computeBookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { groupAdjacentBooktimeBookings } from '@/components/booktime/groupAdjacentBooktimeBookings';
import {
  isAdjacentGroupDimmedLegacyAllOrNothing,
  isReservationSlotDimmed,
} from './reservationSlotSelection';

function booking(
  uuid: string,
  start: string,
  end: string,
  resourceId: string,
): BooktimeBookingRecord {
  return {
    uuid,
    bookingStart: start,
    bookingEnd: end,
    bookingResourceId: resourceId,
  };
}

describe('reservationSlotSelection (adjacent free hour)', () => {
  const limits = computeBookingSelectionLimits(4, 4);
  const hour17 = booking(
    'teren4-17',
    '2026-07-16T15:00:00.000Z',
    '2026-07-16T16:00:00.000Z',
    'teren-4',
  );
  const hour18 = booking(
    'teren4-18',
    '2026-07-16T16:00:00.000Z',
    '2026-07-16T17:00:00.000Z',
    'teren-4',
  );

  it('groups Teren 4 17-19 as adjacent while max stays 1 for a 4p game', () => {
    expect(limits).toEqual({ min: 1, max: 1, playersPerCourt: 4 });
    const entries = groupAdjacentBooktimeBookings([hour17, hour18]);
    expect(entries).toEqual([{ kind: 'group', bookings: [hour17, hour18] }]);
  });

  it('legacy all-or-nothing wrongly disables the whole 2h group before any selection', () => {
    expect(
      isAdjacentGroupDimmedLegacyAllOrNothing(false, 0, 2, limits.max),
    ).toBe(true);
  });

  it('per-hour policy keeps both free hours selectable when nothing is selected', () => {
    expect(isReservationSlotDimmed(false, 0, limits.max)).toBe(false);
    expect(isReservationSlotDimmed(false, 0, limits.max)).toBe(false);
  });

  it('allows selecting only 18-19 inside the 2h group when max=1', () => {
    const selectedIds = [hour18.uuid];
    expect(selectedIds).toHaveLength(limits.max);

    expect(isReservationSlotDimmed(selectedIds.includes(hour18.uuid), selectedIds.length, limits.max)).toBe(
      false,
    );
    expect(isReservationSlotDimmed(selectedIds.includes(hour17.uuid), selectedIds.length, limits.max)).toBe(
      true,
    );
  });
});
