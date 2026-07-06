import { describe, expect, it } from 'vitest';
import type { WeatherHourlyPoint } from '@/types';
import {
  dateKeyInTimezone,
  formatWeatherDayLabel,
  formatWeatherDayRange,
  formatWeatherDayRangeCompact,
  groupWeatherHoursByDay,
  pickRepresentativeWeatherHour,
  summarizeDayTemperatureRange,
} from './weatherDayGroups';

function point(
  time: string,
  temperatureC = 20,
  isDay: boolean | null = true,
): WeatherHourlyPoint {
  return {
    time,
    temperatureC,
    temperatureF: 68,
    weatherCode: 0,
    conditionKey: 'clear',
    precipitationProbability: 10,
    precipitationMm: null,
    windSpeedKmh: null,
    relativeHumidity: null,
    isDay,
  };
}

describe('weatherDayGroups', () => {
  it('groups hourly points by city timezone day key', () => {
    const groups = groupWeatherHoursByDay(
      [
        point('2026-06-28T08:00:00.000Z', 18),
        point('2026-06-28T09:00:00.000Z', 22),
        point('2026-06-29T08:00:00.000Z', 16),
      ],
      'UTC',
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].dayKey).toBe('2026-06-28');
    expect(groups[0].hours).toHaveLength(2);
    expect(groups[0].lowC).toBe(18);
    expect(groups[0].highC).toBe(22);
    expect(groups[1].dayKey).toBe('2026-06-29');
  });

  it('formats today and tomorrow labels in city timezone', () => {
    const todayKey = dateKeyInTimezone(new Date(), 'UTC');
    const [year, month, day] = todayKey.split('-').map(Number);
    const tomorrowKey = dateKeyInTimezone(new Date(Date.UTC(year, month - 1, day + 1, 12)), 'UTC');
    const t = ((key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key) as never;

    expect(formatWeatherDayLabel(todayKey, 'UTC', 'en-GB', t)).toBe('Today');
    expect(formatWeatherDayLabel(tomorrowKey, 'UTC', 'en-GB', t)).toBe('Tomorrow');
  });

  it('formats day temperature range in locale units', () => {
    expect(formatWeatherDayRange({ lowC: 10, highC: 24 }, 'en-GB')).toBe('10–24°C');
  });

  it('summarizes day high and low from hourly points', () => {
    expect(
      summarizeDayTemperatureRange([
        point('2026-06-28T08:00:00.000Z', 18),
        point('2026-06-28T09:00:00.000Z', 22),
      ]),
    ).toEqual({ lowC: 18, highC: 22 });
  });

  it('formats compact day range parts for calendar weather row', () => {
    expect(formatWeatherDayRangeCompact({ lowC: 10, highC: 24 }, 'en-GB')).toEqual({
      low: '10',
      high: '24',
    });
  });

  it('prefers a daytime hour near local noon for truncated forecast days', () => {
    const hours = [
      point('2026-07-16T00:00:00.000Z', 12, false),
      point('2026-07-16T02:00:00.000Z', 13, false),
      point('2026-07-16T08:00:00.000Z', 22, true),
      point('2026-07-16T10:00:00.000Z', 24, true),
    ];

    expect(pickRepresentativeWeatherHour(hours, 'Europe/Belgrade')?.temperatureC).toBe(24);
  });
});
