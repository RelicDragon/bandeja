import { storedUtcIsoToInstant } from '../booktime/localTime';

export const BOOKING_GRID_SLOT_MINUTES = 30;

export type BookingGridRef = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
};

export type TimeGridCellReservationState = {
  coveringBookingIds: string[];
  hasReservation: boolean;
  hasSelectedReservation: boolean;
  isAmbiguous: boolean;
};

export type TimeGridReservationMap = Record<string, TimeGridCellReservationState>;

function wallClockMinutesFromInstant(instant: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => formatted.find((p) => p.type === type)?.value ?? '0';
  return Number(get('hour')) * 60 + Number(get('minute'));
}

function parseGridTimeMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function bookingWallClockIntervalMinutes(
  booking: Pick<BookingGridRef, 'bookingStart' | 'bookingEnd'>,
  timeZone: string,
): { startMinutes: number; endMinutes: number } | null {
  const startInstant = storedUtcIsoToInstant(booking.bookingStart);
  const endInstant = storedUtcIsoToInstant(booking.bookingEnd);
  if (!startInstant || !endInstant) return null;

  const startMinutes = wallClockMinutesFromInstant(startInstant, timeZone);
  let endMinutes = wallClockMinutesFromInstant(endInstant, timeZone);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return { startMinutes, endMinutes };
}

export function slotOverlapsBookingInterval(
  slotStartMinutes: number,
  slotEndMinutes: number,
  bookingStartMinutes: number,
  bookingEndMinutes: number,
): boolean {
  return bookingStartMinutes < slotEndMinutes && bookingEndMinutes > slotStartMinutes;
}

export function mapBookingsToTimeGridCells(args: {
  bookings: readonly BookingGridRef[];
  gridTimes: readonly string[];
  timeZone: string;
  selectedBookingIds?: readonly string[];
  slotMinutes?: number;
}): TimeGridReservationMap {
  const {
    bookings,
    gridTimes,
    timeZone,
    selectedBookingIds = [],
    slotMinutes,
  } = args;
  const step = slotMinutes ?? BOOKING_GRID_SLOT_MINUTES;
  const selectedSet = new Set(selectedBookingIds);

  const intervals = bookings
    .map((booking) => {
      const interval = bookingWallClockIntervalMinutes(booking, timeZone);
      return interval ? { uuid: booking.uuid, ...interval } : null;
    })
    .filter((row): row is { uuid: string; startMinutes: number; endMinutes: number } => row != null);

  const result: TimeGridReservationMap = {};

  for (const time of gridTimes) {
    const slotStart = parseGridTimeMinutes(time);
    const slotEnd = slotStart + step;
    const coveringBookingIds = intervals
      .filter(({ startMinutes, endMinutes }) =>
        slotOverlapsBookingInterval(slotStart, slotEnd, startMinutes, endMinutes),
      )
      .map(({ uuid }) => uuid);

    const hasSelectedReservation = coveringBookingIds.some((id) => selectedSet.has(id));

    result[time] = {
      coveringBookingIds,
      hasReservation: coveringBookingIds.length > 0,
      hasSelectedReservation,
      isAmbiguous: coveringBookingIds.length > 1,
    };
  }

  return result;
}
