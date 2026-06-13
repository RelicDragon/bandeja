export interface BookingTimeSnapshot {
  bookingStart?: string | null;
  bookingEnd?: string | null;
}

export function deriveGameTimeFromBookings(
  bookings: BookingTimeSnapshot[],
): { startTime: string | null; endTime: string | null } {
  const starts = bookings
    .map((b) => b.bookingStart)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
  const ends = bookings
    .map((b) => b.bookingEnd)
    .filter((e): e is string => typeof e === 'string' && e.length > 0);

  if (starts.length === 0 || ends.length === 0) {
    return { startTime: null, endTime: null };
  }

  return {
    startTime: starts.reduce((min, s) => (s < min ? s : min)),
    endTime: ends.reduce((max, e) => (e > max ? e : max)),
  };
}
