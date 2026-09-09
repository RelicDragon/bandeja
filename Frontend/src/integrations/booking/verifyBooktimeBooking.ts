import type { BooktimeBookingsPage } from '@/integrations/booktime/client';

export function isCancelledBooking(status?: string): boolean {
  return /^(cancelled|canceled)$/i.test(status?.trim() ?? '');
}

/** Exhaust both lists: a booking can move to previous while its card is open. */
export async function verifyBooktimeBooking(
  externalBookingId: string,
  fetchUpcoming: (index: number, size: number) => Promise<BooktimeBookingsPage>,
  fetchPrevious: (index: number, size: number) => Promise<BooktimeBookingsPage>,
): Promise<boolean> {
  const size = 50;
  for (const fetchPage of [fetchUpcoming, fetchPrevious]) {
    const seen = new Set<string>();
    for (let index = 0; ; index += 1) {
      const page = await fetchPage(index, size);
      const match = page.bookings.find((booking) => booking.uuid === externalBookingId);
      if (match) return !isCancelledBooking(match.status);
      if (page.bookings.length === 0) {
        if (page.totalCount != null && seen.size < page.totalCount) {
          throw new Error('Incomplete booking list');
        }
        break;
      }
      const before = seen.size;
      page.bookings.forEach((booking) => seen.add(booking.uuid));
      if (seen.size === before) throw new Error('Booking pagination did not advance');
      if (page.totalCount != null ? seen.size >= page.totalCount : page.bookings.length < size) break;
    }
  }
  return false;
}
