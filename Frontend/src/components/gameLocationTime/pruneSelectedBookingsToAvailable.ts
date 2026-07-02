import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { BookingSelectionLimits } from '@shared/gameBooking/computeBookingSelectionLimits';
import { resolveBookingSelectionAfterDeselect } from './resolveBookingSelectionAfterDeselect';

export function pruneSelectedBookingsToAvailable({
  selectedBookingIds,
  availableBookings,
  selectionLimits,
}: {
  selectedBookingIds: string[];
  availableBookings: BooktimeBookingRecord[];
  selectionLimits: BookingSelectionLimits;
}): { ids: string[]; records: BooktimeBookingRecord[] } | null {
  if (selectedBookingIds.length === 0) return null;

  const availableById = new Map(availableBookings.map((booking) => [booking.uuid, booking]));
  const unavailableIds = selectedBookingIds.filter((id) => !availableById.has(id));
  if (unavailableIds.length === 0) return null;

  const ids = resolveBookingSelectionAfterDeselect(
    selectedBookingIds,
    unavailableIds,
    selectionLimits,
  );
  return {
    ids,
    records: ids
      .map((id) => availableById.get(id))
      .filter((booking): booking is BooktimeBookingRecord => booking != null),
  };
}
