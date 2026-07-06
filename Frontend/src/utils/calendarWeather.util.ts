import type { WeatherDay, WeatherHourlyPoint, WeatherWindow } from '@/types';
import { compareDayKeys, dateKeyInTimezone, groupWeatherHoursByDay } from '@/utils/weatherDayGroups';

export interface CalendarDayWeather {
  point: WeatherHourlyPoint;
  stale: boolean;
}

export function pickRepresentativeWeatherHour(hours: WeatherHourlyPoint[]): WeatherHourlyPoint | null {
  if (hours.length === 0) return null;

  const sorted = [...hours].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
  );
  const middayIndex = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length / 2)));
  return sorted[middayIndex] ?? sorted[0] ?? null;
}

export function calendarDayWeatherFromPoint(
  point: WeatherHourlyPoint | null | undefined,
  stale = false,
): CalendarDayWeather | null {
  if (!point) return null;
  return { point, stale };
}

export function calendarDayWeatherFromDay(day: WeatherDay | undefined): CalendarDayWeather | null {
  if (!day?.available || day.hours.length === 0) return null;

  const point = pickRepresentativeWeatherHour(day.hours);
  return calendarDayWeatherFromPoint(point, day.stale);
}

export function splitCalendarDayKeys(dayKeys: string[], timezone: string): {
  pastDayKeys: string[];
  todayKey: string;
} {
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  const pastDayKeys = dayKeys.filter((dayKey) => compareDayKeys(dayKey, todayKey) < 0);
  return { pastDayKeys, todayKey };
}

export function buildCalendarWeatherByDay(params: {
  dayKeys: string[];
  forecastWindow?: WeatherWindow | null;
  pastDaysByKey?: ReadonlyMap<string, WeatherDay | undefined>;
}): Map<string, CalendarDayWeather> {
  const map = new Map<string, CalendarDayWeather>();
  const allowedDayKeys = new Set(params.dayKeys);

  if (params.forecastWindow?.available && params.forecastWindow.hours.length > 0) {
    const groups = groupWeatherHoursByDay(
      params.forecastWindow.hours,
      params.forecastWindow.cityTimezone,
    );

    for (const group of groups) {
      if (!allowedDayKeys.has(group.dayKey)) continue;
      const weather = calendarDayWeatherFromPoint(group.middayPoint, params.forecastWindow.stale);
      if (weather) map.set(group.dayKey, weather);
    }
  }

  params.pastDaysByKey?.forEach((day, dayKey) => {
    if (!allowedDayKeys.has(dayKey) || map.has(dayKey)) return;
    const weather = calendarDayWeatherFromDay(day);
    if (weather) map.set(dayKey, weather);
  });

  return map;
}
