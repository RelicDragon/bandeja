import type { WeatherDay, WeatherHourlyPoint, WeatherSummary, WeatherWindow } from '@/types';
import {
  compareDayKeys,
  dateKeyInTimezone,
  groupWeatherHoursByDay,
  localHourInTimezone,
  maxForecastDayKey,
  pickRepresentativeWeatherHour,
  trimTrailingIncompleteWeatherDayGroups,
} from '@/utils/weatherDayGroups';

export { pickRepresentativeWeatherHour } from '@/utils/weatherDayGroups';

const CALENDAR_FORECAST_ANCHOR_ISO = 'T12:00:00.000Z';

export interface CalendarDayWeather {
  point: WeatherHourlyPoint;
  stale: boolean;
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

  const point = pickRepresentativeWeatherHour(day.hours, day.cityTimezone);
  return calendarDayWeatherFromPoint(point, day.stale);
}

export function calendarForecastQueryRange(cityTimezone?: string | null): {
  startTime: string;
  endTime: string;
} {
  const timezone = cityTimezone || 'UTC';
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  const maxForecastDay = maxForecastDayKey(timezone);
  return {
    startTime: `${todayKey}${CALENDAR_FORECAST_ANCHOR_ISO}`,
    endTime: `${maxForecastDay}${CALENDAR_FORECAST_ANCHOR_ISO}`,
  };
}

export function buildForecastWindowForDayKey(
  forecastWindow: WeatherWindow | null | undefined,
  dayKey: string,
): WeatherWindow | null {
  if (!forecastWindow?.available || forecastWindow.hours.length === 0) return null;

  const groups = trimTrailingIncompleteWeatherDayGroups(
    groupWeatherHoursByDay(forecastWindow.hours, forecastWindow.cityTimezone),
    forecastWindow.cityTimezone,
  );
  const dayGroup = groups.find((group) => group.dayKey === dayKey);
  const hours = dayGroup?.hours ?? [];
  if (hours.length === 0) return null;

  const point = dayGroup?.middayPoint ?? pickRepresentativeWeatherHour(hours, forecastWindow.cityTimezone);
  if (!point) return null;

  const summary: WeatherSummary = {
    ...point,
    provider: forecastWindow.provider,
    fetchedAt: forecastWindow.fetchedAt,
    stale: forecastWindow.stale,
  };

  return {
    ...forecastWindow,
    available: true,
    summary,
    hours,
  };
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
    const groups = trimTrailingIncompleteWeatherDayGroups(
      groupWeatherHoursByDay(
        params.forecastWindow.hours,
        params.forecastWindow.cityTimezone,
      ),
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

export function buildTimeSlotWeatherByTime(params: {
  times: string[];
  hours: WeatherHourlyPoint[];
  timezone: string;
  stale?: boolean;
}): Map<string, CalendarDayWeather> {
  const map = new Map<string, CalendarDayWeather>();
  const { times, hours, timezone, stale = false } = params;
  if (times.length === 0 || hours.length === 0) return map;

  const hourIndex = new Map<number, WeatherHourlyPoint>();
  for (const point of hours) {
    const localHour = localHourInTimezone(point.time, timezone);
    if (!hourIndex.has(localHour)) {
      hourIndex.set(localHour, point);
    }
  }

  for (const time of times) {
    const [hoursPart] = time.split(':').map(Number);
    if (!Number.isFinite(hoursPart)) continue;
    const point = hourIndex.get(hoursPart);
    if (!point) continue;
    const weather = calendarDayWeatherFromPoint(point, stale);
    if (weather) map.set(time, weather);
  }

  return map;
}
