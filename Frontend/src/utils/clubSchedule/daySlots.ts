import type { Club } from '@/types';
import { getClubTimezone } from '@/hooks/useGameTimeDuration';
import { generateTimeSlots, resolveSlotMinutes } from './timeSlots';

function getCurrentTimeInTimezone(timezone: string): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return { hour, minute };
}

function isSameDateInTimezone(date1: Date, date2: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date1) === formatter.format(date2);
}

export function getAvailableDaySlots(club: Club | undefined, date: Date): string[] {
  const step = resolveSlotMinutes(club?.defaultSlotMinutes);
  const allSlots = generateTimeSlots(club?.openingTime, club?.closingTime, step);
  const clubTimezone = getClubTimezone(club);
  const isToday = isSameDateInTimezone(date, new Date(), clubTimezone);
  if (!isToday) return allSlots;

  const { hour, minute } = getCurrentTimeInTimezone(clubTimezone);
  const nowMinutes = hour * 60 + minute;
  return allSlots.filter((time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m > nowMinutes;
  });
}
