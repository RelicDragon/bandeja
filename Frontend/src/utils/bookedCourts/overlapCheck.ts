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

export interface BookingOverlapResult {
  hasHardOverlap: boolean;
  hasSoftOverlap: boolean;
  softCount: number;
}

export function checkBookingOverlap(
  bookings: BookedCourtSlot[],
  startTime: string,
  durationHours: number,
  club?: Club
): BookingOverlapResult {
  if (!startTime || !durationHours) {
    return { hasHardOverlap: false, hasSoftOverlap: false, softCount: 0 };
  }

  const startMinutes = parseMinutes(startTime);
  const endMinutes = startMinutes + durationHours * 60;

  let hasHardOverlap = false;
  let softCount = 0;

  for (const booking of bookings) {
    const bookingStart = formatTimeInClubTimezone(new Date(booking.startTime), club);
    const bookingEnd = formatTimeInClubTimezone(new Date(booking.endTime), club);
    const bookingStartMinutes = parseMinutes(bookingStart);
    const bookingEndMinutes = parseMinutes(bookingEnd);

    if (bookingStartMinutes >= endMinutes || bookingEndMinutes <= startMinutes) continue;

    if (isHardSlot(booking)) {
      hasHardOverlap = true;
    } else if (!booking.hasBookedCourt) {
      softCount += 1;
    }
  }

  return {
    hasHardOverlap,
    hasSoftOverlap: softCount > 0,
    softCount,
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
