import type { Club } from '@/types';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import { formatClubDateKey } from '@/integrations/booktime/slots';
import { storedUtcIsoToInstant } from '@shared/booktime/localTime';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';

export function bookingClubDateKey(
  booking: BooktimeBookingRecord,
  club?: Club,
): string | null {
  const instant = storedUtcIsoToInstant(booking.bookingStart);
  if (!instant) return null;
  const tz = getClubTimezone(club);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function bookingOccursOnClubDate(
  booking: BooktimeBookingRecord,
  date: Date,
  club?: Club,
): boolean {
  const bookingDateKey = bookingClubDateKey(booking, club);
  if (!bookingDateKey) return false;
  return bookingDateKey === formatClubDateKey(date, club);
}

export function filterBookingsForClubDate(
  bookings: BooktimeBookingRecord[],
  date: Date,
  club?: Club,
): BooktimeBookingRecord[] {
  return bookings.filter((booking) => bookingOccursOnClubDate(booking, date, club));
}
