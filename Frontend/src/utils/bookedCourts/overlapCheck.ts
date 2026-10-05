import { BookedCourtSlot, Club } from '@/types';
import { createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';

function formatTimeInClubTimezone(date: Date, club?: Club): string {
  const clubTimezone = getClubTimezone(club);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: clubTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function isHardSlot(booking: BookedCourtSlot): boolean {
  return Boolean(booking.clubBooked || booking.holdBlocked || booking.slotKind === 'external' || booking.slotKind === 'hold');
}

/**
 * Another app game holds this court for real: its slot is reserved (newer
 * payloads say so per slot), else the game-level legacy flag.
 */
function isReservedGameSlot(booking: BookedCourtSlot): boolean {
  if (booking.reservation != null) return booking.reservation === 'reserved';
  return booking.hasBookedCourt;
}

export interface BookingOverlapResult {
  /** A club booking / hold, or another app game with that court reserved. */
  hasHardOverlap: boolean;
  /** Another app game only planned on that court (a warning, never a block). */
  hasSoftOverlap: boolean;
  softCount: number;
  /** Other app games that reserved that court over the window (the server answers 409 `court.clash`). */
  reservedGameCount: number;
}

export type BookingOverlapOptions = {
  /** The game being edited: its own blocks are never a conflict. */
  excludeGameId?: string | null;
};

export function checkBookingOverlap(
  bookings: BookedCourtSlot[],
  startTime: string,
  durationHours: number,
  club?: Club,
  options: BookingOverlapOptions = {},
): BookingOverlapResult {
  if (!startTime || !durationHours) {
    return { hasHardOverlap: false, hasSoftOverlap: false, softCount: 0, reservedGameCount: 0 };
  }

  const startMinutes = parseMinutes(startTime);
  const endMinutes = startMinutes + durationHours * 60;

  let hasHardOverlap = false;
  let softCount = 0;
  let reservedGameCount = 0;

  for (const booking of bookings) {
    if (options.excludeGameId && booking.gameId === options.excludeGameId) continue;
    const bookingStart = formatTimeInClubTimezone(new Date(booking.startTime), club);
    const bookingEnd = formatTimeInClubTimezone(new Date(booking.endTime), club);
    const bookingStartMinutes = parseMinutes(bookingStart);
    const bookingEndMinutes = parseMinutes(bookingEnd);

    if (bookingStartMinutes >= endMinutes || bookingEndMinutes <= startMinutes) continue;

    if (isHardSlot(booking)) {
      hasHardOverlap = true;
    } else if (isReservedGameSlot(booking)) {
      hasHardOverlap = true;
      reservedGameCount += 1;
    } else {
      softCount += 1;
    }
  }

  return {
    hasHardOverlap,
    hasSoftOverlap: softCount > 0,
    softCount,
    reservedGameCount,
  };
}

export async function fetchBookedCourtsForDay(params: {
  clubId: string;
  selectedDate: Date;
  courtId?: string;
  club?: Club;
}): Promise<BookedCourtSlot[]> {
  const { clubId, selectedDate, courtId, club } = params;
  const startDate = createDateFromClubTime(selectedDate, '00:00', club);
  const endDate = createDateFromClubTime(selectedDate, '23:59', club);
  const { gamesApi } = await import('@/api');
  const response = await gamesApi.getBookedCourts({
    clubId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    courtId: courtId && courtId !== 'notBooked' ? courtId : undefined,
  });
  return response.data || [];
}
