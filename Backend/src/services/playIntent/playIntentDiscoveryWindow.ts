import { formatInTimeZone } from 'date-fns-tz';

const EVENING_START_HOUR = 18;

function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function playIntentDiscoveryDateKeys(
  timezone: string,
  now: Date = new Date(),
): string[] {
  const todayKey = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const localHour = Number(formatInTimeZone(now, timezone, 'H'));

  return localHour >= EVENING_START_HOUR
    ? [todayKey, addCalendarDays(todayKey, 1)]
    : [todayKey];
}
