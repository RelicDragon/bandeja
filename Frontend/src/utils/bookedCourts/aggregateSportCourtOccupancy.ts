import type { BookedCourtSlot, Club, Court } from '@/types';

export interface OccupancySlotInfo {
  courtId: string;
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  holdBlocked?: boolean;
}

type FormatClubTime = (date: Date, club?: Club) => string;

export function filterBookingsByCourts(
  bookings: BookedCourtSlot[],
  courts: Court[],
): BookedCourtSlot[] {
  if (courts.length === 0) return bookings;
  const courtIds = new Set(courts.map((c) => c.id));
  return bookings.filter((b) => b.courtId != null && courtIds.has(b.courtId));
}

export function buildCourtTimeSlotMap(
  bookings: BookedCourtSlot[],
  club: Club | undefined,
  formatTime: FormatClubTime,
): Map<string, OccupancySlotInfo> {
  const map = new Map<string, OccupancySlotInfo>();

  for (const booking of bookings) {
    if (!booking.courtId) continue;

    const startDate = new Date(booking.startTime);
    const endDate = new Date(booking.endTime);
    const startTimeStr = formatTime(startDate, club);
    const endTimeStr = formatTime(endDate, club);

    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const key = `${booking.courtId}:${timeStr}`;
      map.set(key, {
        courtId: booking.courtId,
        courtName: booking.courtName,
        integrationCourtName: booking.integrationCourtName ?? null,
        startTime: startTimeStr,
        endTime: endTimeStr,
        hasBookedCourt: booking.hasBookedCourt,
        clubBooked: booking.clubBooked || false,
        holdBlocked: booking.holdBlocked,
      });
    }
  }

  return map;
}

export function isAggregateTimeBooked(
  time: string,
  courts: Court[],
  courtTimeMap: Map<string, OccupancySlotInfo>,
): boolean {
  return courts.some((court) => courtTimeMap.has(`${court.id}:${time}`));
}

export function isAggregateTimeFullyExternallyBlocked(
  time: string,
  courts: Court[],
  courtTimeMap: Map<string, OccupancySlotInfo>,
): boolean {
  if (courts.length === 0) return false;

  for (const court of courts) {
    if (!courtTimeMap.has(`${court.id}:${time}`)) {
      return false;
    }
  }

  return courts.every((court) => {
    const slot = courtTimeMap.get(`${court.id}:${time}`);
    return slot != null && (slot.clubBooked || Boolean(slot.holdBlocked));
  });
}

export function areAggregateSlotsUnconfirmed(
  time: string,
  courts: Court[],
  courtTimeMap: Map<string, OccupancySlotInfo>,
): boolean {
  const occupied = courts
    .map((court) => courtTimeMap.get(`${court.id}:${time}`))
    .filter((slot): slot is OccupancySlotInfo => slot != null);

  if (occupied.length === 0) return false;

  return occupied.every(
    (slot) => !slot.hasBookedCourt && !slot.clubBooked && !slot.holdBlocked,
  );
}

export function getAggregateSlotInfosAtTime(
  time: string,
  courts: Court[],
  courtTimeMap: Map<string, OccupancySlotInfo>,
): OccupancySlotInfo[] {
  return courts
    .map((court) => courtTimeMap.get(`${court.id}:${time}`))
    .filter((slot): slot is OccupancySlotInfo => slot != null);
}
