import type { BookedCourtSlot, Club, Court } from '@/types';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { getAvailableDaySlots } from '@/utils/clubSchedule/daySlots';
import { resolveSlotMinutes } from '@/utils/clubSchedule/timeSlots';

export interface CourtDayOccupancy {
  bookedSlots: number;
  totalSlots: number;
  fillPercent: number;
}

function formatTimeInClubTimezone(date: Date, club?: Club): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: getClubTimezone(club),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

function bookedSlotKeysForCourt(
  bookings: BookedCourtSlot[],
  courtId: string,
  club: Club | undefined,
  stepMinutes: number,
): Set<string> {
  const keys = new Set<string>();
  for (const booking of bookings) {
    if (booking.courtId !== courtId) continue;
    const startTimeStr = formatTimeInClubTimezone(new Date(booking.startTime), club);
    const endTimeStr = formatTimeInClubTimezone(new Date(booking.endTime), club);
    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const [endHour, endMinute] = endTimeStr.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    for (let minutes = startMinutes; minutes < endMinutes; minutes += stepMinutes) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      keys.add(timeStr);
    }
  }
  return keys;
}

export function computeCourtDayOccupancy(
  courts: Court[],
  bookings: BookedCourtSlot[],
  club: Club | undefined,
  selectedDate: Date,
  referenceNow: Date = new Date(),
): Map<string, CourtDayOccupancy> {
  const stepMinutes = resolveSlotMinutes(club?.defaultSlotMinutes);
  const availableSlots = getAvailableDaySlots(club, selectedDate, referenceNow);
  const totalSlots = availableSlots.length;
  const availableSet = new Set(availableSlots);
  const result = new Map<string, CourtDayOccupancy>();

  for (const court of courts) {
    const bookedKeys = bookedSlotKeysForCourt(bookings, court.id, club, stepMinutes);
    let bookedSlots = 0;
    for (const key of bookedKeys) {
      if (availableSet.has(key)) bookedSlots += 1;
    }
    const fillPercent = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
    result.set(court.id, { bookedSlots, totalSlots, fillPercent });
  }

  return result;
}
