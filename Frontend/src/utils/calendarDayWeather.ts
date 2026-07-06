import { calendarDayKey } from '@/utils/calendarSelectedDayFilter';
import { pickRepresentativeWeatherHour } from '@/utils/calendarWeather.util';
import { compareDayKeys, dateKeyInTimezone } from '@/utils/weatherDayGroups';
import type { WeatherDay, WeatherSummary, WeatherWindow } from '@/types';

const DAY_ANCHOR_ISO = 'T12:00:00.000Z';
const DAY_END_ISO = 'T13:00:00.000Z';

export function calendarDayWeatherAnchor(selectedDate: Date): {
  dayKey: string;
  startTime: string;
  endTime: string;
} {
  const dayKey = calendarDayKey(selectedDate);
  return {
    dayKey,
    startTime: `${dayKey}${DAY_ANCHOR_ISO}`,
    endTime: `${dayKey}${DAY_END_ISO}`,
  };
}

export function isCalendarDayBeforeToday(dayKey: string, timezone: string): boolean {
  const todayKey = dateKeyInTimezone(new Date(), timezone);
  return compareDayKeys(dayKey, todayKey) < 0;
}

export function weatherDayToWindow(day: WeatherDay): WeatherWindow {
  const point = pickRepresentativeWeatherHour(day.hours, day.cityTimezone);
  const summary: WeatherSummary | null = point
    ? {
        ...point,
        provider: 'open-meteo',
        fetchedAt: day.fetchedAt,
        stale: day.stale,
      }
    : null;

  return {
    provider: 'open-meteo',
    cityId: day.cityId,
    cityName: day.cityName,
    cityTimezone: day.cityTimezone,
    fetchedAt: day.fetchedAt,
    stale: day.stale,
    source: day.source,
    available: day.available,
    summary,
    hours: day.hours,
    attribution: 'Open-Meteo',
    ...(day.unavailableReason ? { unavailableReason: day.unavailableReason } : {}),
  };
}
