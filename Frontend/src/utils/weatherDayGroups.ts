import type { TFunction } from 'i18next';
import type { WeatherHourlyPoint } from '@/types';
import { shouldUseFahrenheit } from '@/utils/weather';

const HOUR_MS = 60 * 60 * 1000;
const MAX_TIMEZONE_OFFSET_HOURS = 14;

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays, 12));
  return shifted.toISOString().slice(0, 10);
}

export function compareDayKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function maxForecastDayKey(timezone: string): string {
  return shiftDayKey(dateKeyInTimezone(new Date(), timezone), 9);
}

export function dateKeyInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function expectedUtcHourlyTimesForLocalDay(dayKey: string, timezone: string): Set<string> {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!year || !month || !day) return new Set();

  const searchStart = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - MAX_TIMEZONE_OFFSET_HOURS * HOUR_MS;
  const searchEnd = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) + MAX_TIMEZONE_OFFSET_HOURS * HOUR_MS;
  const times = new Set<string>();

  for (let time = searchStart; time < searchEnd; time += HOUR_MS) {
    const date = new Date(time);
    if (dateKeyInTimezone(date, timezone) === dayKey) {
      times.add(date.toISOString());
    }
  }

  return times;
}

export function hasCompleteWeatherDayCoverage(
  hours: WeatherHourlyPoint[],
  dayKey: string,
  timezone: string,
): boolean {
  const expectedTimes = expectedUtcHourlyTimesForLocalDay(dayKey, timezone);
  if (expectedTimes.size === 0) return false;

  const actualTimes = new Set<string>();
  for (const point of hours) {
    const time = new Date(point.time);
    if (Number.isNaN(time.getTime())) continue;
    if (dateKeyInTimezone(time, timezone) === dayKey) {
      actualTimes.add(time.toISOString());
    }
  }

  for (const expectedTime of expectedTimes) {
    if (!actualTimes.has(expectedTime)) return false;
  }
  return true;
}

export interface WeatherDayGroup {
  dayKey: string;
  hours: WeatherHourlyPoint[];
  highC: number;
  lowC: number;
  peakPrecipitation: number | null;
  middayPoint: WeatherHourlyPoint;
}

function summarizeDayHours(
  hours: WeatherHourlyPoint[],
  timezone: string,
): Pick<WeatherDayGroup, 'highC' | 'lowC' | 'peakPrecipitation' | 'middayPoint'> {
  const sorted = [...hours].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const range = summarizeDayTemperatureRange(sorted);
  const precipitations = sorted
    .map((point) => point.precipitationProbability)
    .filter((value): value is number => typeof value === 'number');

  return {
    highC: range?.highC ?? 0,
    lowC: range?.lowC ?? 0,
    peakPrecipitation: precipitations.length > 0 ? Math.max(...precipitations) : null,
    middayPoint: pickRepresentativeWeatherHour(sorted, timezone) ?? sorted[0],
  };
}

export function localHourInTimezone(isoTime: string, timezone: string): number {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone || 'UTC',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(isoTime)),
    );
    return Number.isFinite(hour) ? hour : new Date(isoTime).getUTCHours();
  } catch {
    return new Date(isoTime).getUTCHours();
  }
}

export function pickRepresentativeWeatherHour(
  hours: WeatherHourlyPoint[],
  cityTimezone?: string | null,
): WeatherHourlyPoint | null {
  if (hours.length === 0) return null;

  const sorted = [...hours].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
  const timezone = cityTimezone || 'UTC';

  const scorePoint = (point: WeatherHourlyPoint): number => {
    const noonDistance = Math.abs(localHourInTimezone(point.time, timezone) - 13);
    const nightPenalty = point.isDay === false ? 12 : point.isDay === true ? 0 : 4;
    return noonDistance + nightPenalty;
  };

  return sorted.reduce((best, point) => (
    scorePoint(point) < scorePoint(best) ? point : best
  ));
}

export function summarizeDayTemperatureRange(
  hours: WeatherHourlyPoint[],
): { lowC: number; highC: number } | null {
  const temperatures = hours.map((point) => point.temperatureC).filter(Number.isFinite);
  if (temperatures.length === 0) return null;
  return {
    lowC: Math.min(...temperatures),
    highC: Math.max(...temperatures),
  };
}

export function groupWeatherHoursByDay(hours: WeatherHourlyPoint[], timezone: string): WeatherDayGroup[] {
  const groups = new Map<string, WeatherHourlyPoint[]>();

  for (const point of hours) {
    const time = new Date(point.time);
    if (Number.isNaN(time.getTime())) continue;

    const dayKey = dateKeyInTimezone(time, timezone);
    const bucket = groups.get(dayKey) ?? [];
    bucket.push(point);
    groups.set(dayKey, bucket);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, dayHours]) => ({
      dayKey,
      hours: [...dayHours].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()),
      ...summarizeDayHours(dayHours, timezone),
    }));
}

export function trimTrailingIncompleteWeatherDayGroups(
  groups: WeatherDayGroup[],
  timezone: string,
): WeatherDayGroup[] {
  let keepGroupCount = groups.length;

  while (keepGroupCount > 1) {
    const group = groups[keepGroupCount - 1];
    if (hasCompleteWeatherDayCoverage(group.hours, group.dayKey, timezone)) {
      break;
    }
    keepGroupCount -= 1;
  }

  return keepGroupCount === groups.length ? groups : groups.slice(0, keepGroupCount);
}

export function formatWeatherDayLabel(
  dayKey: string,
  timezone: string,
  locale: string,
  t: TFunction,
): string {
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  if (dayKey === todayKey) {
    return t('weather.dayToday', { defaultValue: 'Today' });
  }

  const [year, month, day] = todayKey.split('-').map(Number);
  const tomorrowDate = new Date(Date.UTC(year, month - 1, day + 1, 12));
  if (dayKey === dateKeyInTimezone(tomorrowDate, timezone)) {
    return t('weather.dayTomorrow', { defaultValue: 'Tomorrow' });
  }

  const [targetYear, targetMonth, targetDay] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 12));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone || 'UTC',
  }).format(date);
}

export function formatWeatherDayRange(
  group: Pick<WeatherDayGroup, 'lowC' | 'highC'>,
  locale: string,
): string {
  const unit = shouldUseFahrenheit(locale) ? 'F' : 'C';
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const toDisplay = (celsius: number) => {
    if (unit === 'F') return Math.round((celsius * 9) / 5 + 32);
    return Math.round(celsius);
  };

  return `${formatter.format(toDisplay(group.lowC))}–${formatter.format(toDisplay(group.highC))}°${unit}`;
}

export function formatWeatherDayRangeCompact(
  range: Pick<WeatherDayGroup, 'lowC' | 'highC'>,
  locale: string,
): { low: string; high: string } {
  const unit = shouldUseFahrenheit(locale) ? 'F' : 'C';
  const toDisplay = (celsius: number) => {
    if (unit === 'F') return Math.round((celsius * 9) / 5 + 32);
    return Math.round(celsius);
  };

  return {
    low: String(toDisplay(range.lowC)),
    high: String(toDisplay(range.highC)),
  };
}
