import type { TFunction } from 'i18next';
import type { WeatherHourlyPoint } from '@/types';
import { shouldUseFahrenheit } from '@/utils/weather';

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

export interface WeatherDayGroup {
  dayKey: string;
  hours: WeatherHourlyPoint[];
  highC: number;
  lowC: number;
  peakPrecipitation: number | null;
  middayPoint: WeatherHourlyPoint;
}

function summarizeDayHours(hours: WeatherHourlyPoint[]): Pick<WeatherDayGroup, 'highC' | 'lowC' | 'peakPrecipitation' | 'middayPoint'> {
  const sorted = [...hours].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const temperatures = sorted.map((point) => point.temperatureC).filter(Number.isFinite);
  const precipitations = sorted
    .map((point) => point.precipitationProbability)
    .filter((value): value is number => typeof value === 'number');

  const middayIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length / 2)));

  return {
    highC: temperatures.length > 0 ? Math.max(...temperatures) : 0,
    lowC: temperatures.length > 0 ? Math.min(...temperatures) : 0,
    peakPrecipitation: precipitations.length > 0 ? Math.max(...precipitations) : null,
    middayPoint: sorted[middayIndex] ?? sorted[0],
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
      ...summarizeDayHours(dayHours),
    }));
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
