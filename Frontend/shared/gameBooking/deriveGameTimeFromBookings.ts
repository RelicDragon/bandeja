import { booktimeIsoToUtcIso } from '../booktime/localTime';

export interface BookingTimeSnapshot {
  bookingStart?: string | null;
  bookingEnd?: string | null;
}

export type DeriveGameTimeFromBookingsOptions = {
  timeZone?: string;
};

function normalizeBookingInstant(iso: string, timeZone?: string): string {
  if (!timeZone) return iso;
  return booktimeIsoToUtcIso(iso, timeZone) ?? iso;
}

export function deriveGameTimeFromBookings(
  bookings: BookingTimeSnapshot[],
  options?: DeriveGameTimeFromBookingsOptions,
): { startTime: string | null; endTime: string | null } {
  const timeZone = options?.timeZone;
  const starts = bookings
    .map((b) => b.bookingStart)
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => normalizeBookingInstant(s, timeZone));
  const ends = bookings
    .map((b) => b.bookingEnd)
    .filter((e): e is string => typeof e === 'string' && e.length > 0)
    .map((e) => normalizeBookingInstant(e, timeZone));

  if (starts.length === 0 || ends.length === 0) {
    return { startTime: null, endTime: null };
  }

  return {
    startTime: starts.reduce((min, s) => (s < min ? s : min)),
    endTime: ends.reduce((max, e) => (e > max ? e : max)),
  };
}
