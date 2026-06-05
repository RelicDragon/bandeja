import { Club } from '@/types';
import { createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';

type ClubTimeContext = Pick<Club, 'city'> | { city?: { timezone?: string } | null } | null | undefined;

function resolveTimezone(club: ClubTimeContext): string {
  return getClubTimezone(club as Club | undefined);
}

export function clubLocalDateString(club?: ClubTimeContext, at: Date = new Date()): string {
  const tz = resolveTimezone(club);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function clubLocalTimeMinutes(iso: string, club?: ClubTimeContext): number {
  const tz = resolveTimezone(club);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hour * 60 + minute;
}

export function clubLocalNowMinutes(club?: ClubTimeContext): number {
  const tz = resolveTimezone(club);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  return hour * 60 + minute;
}

export function scheduleDateToClubDate(scheduleDate: string): Date {
  const [y, m, d] = scheduleDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function holdRangeFromClubSlot(
  scheduleDate: string,
  startTime: string,
  durationHours: number,
  club?: ClubTimeContext
): { startTime: string; endTime: string } {
  const start = createDateFromClubTime(scheduleDateToClubDate(scheduleDate), startTime, club as Club | undefined);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}
