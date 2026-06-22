export type LocationTimeMode = 'timeSlots' | 'bookings';

export function deriveLocationTimeMode(selectedBookingIds: readonly string[]): LocationTimeMode {
  return selectedBookingIds.length > 0 ? 'bookings' : 'timeSlots';
}
