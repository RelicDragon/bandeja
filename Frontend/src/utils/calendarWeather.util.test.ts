import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildCalendarWeatherByDay,
  buildForecastWindowForDayKey,
  calendarDayWeatherFromDay,
  pickRepresentativeWeatherHour,
  splitCalendarDayKeys,
} from './calendarWeather.util';
import type { WeatherDay, WeatherHourlyPoint, WeatherWindow } from '@/types';

function hour(time: string, temperatureC: number, isDay: boolean | null = true): WeatherHourlyPoint {
  return {
    time,
    temperatureC,
    temperatureF: 32,
    weatherCode: 0,
    conditionKey: 'clear',
    precipitationProbability: null,
    precipitationMm: null,
    windSpeedKmh: null,
    relativeHumidity: null,
    isDay,
  };
}

const HOUR_MS = 60 * 60 * 1000;

function hourlyTimes(start: string, count: number): string[] {
  const startTime = new Date(start).getTime();
  return Array.from({ length: count }, (_, index) => new Date(startTime + index * HOUR_MS).toISOString());
}

function forecastHours(start: string, count: number): WeatherHourlyPoint[] {
  return hourlyTimes(start, count).map((time, index) => hour(time, 10 + (index % 20)));
}

describe('pickRepresentativeWeatherHour', () => {
  it('picks the middle hour for a day', () => {
    const hours = [
      hour('2026-06-15T06:00:00.000Z', 10),
      hour('2026-06-15T12:00:00.000Z', 22),
      hour('2026-06-15T18:00:00.000Z', 18),
    ];

    expect(pickRepresentativeWeatherHour(hours, 'UTC')?.temperatureC).toBe(22);
  });

  it('returns null for empty hours', () => {
    expect(pickRepresentativeWeatherHour([])).toBeNull();
  });
});

describe('calendarDayWeatherFromDay', () => {
  it('returns null when forecast is unavailable', () => {
    const day: WeatherDay = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'Europe/Belgrade',
      date: '2026-06-15',
      fetchedAt: '2026-06-15T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: false,
      hours: [],
      attribution: 'Open-Meteo',
    };

    expect(calendarDayWeatherFromDay(day)).toBeNull();
  });

  it('maps available day data to a calendar pill payload', () => {
    const day: WeatherDay = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'Europe/Belgrade',
      date: '2026-06-15',
      fetchedAt: '2026-06-15T10:00:00.000Z',
      stale: true,
      source: 'forecast',
      available: true,
      hours: [hour('2026-06-15T12:00:00.000Z', 24)],
      attribution: 'Open-Meteo',
    };

    expect(calendarDayWeatherFromDay(day)).toEqual({
      point: day.hours[0],
      stale: true,
    });
  });
});

describe('splitCalendarDayKeys', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('separates past days from today using city timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T10:00:00.000Z'));

    const dayKeys = ['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'];
    const { pastDayKeys, todayKey } = splitCalendarDayKeys(dayKeys, 'UTC');

    expect(todayKey).toBe('2026-07-07');
    expect(pastDayKeys).toEqual(['2026-07-05', '2026-07-06']);
  });
});

describe('buildForecastWindowForDayKey', () => {
  it('builds a day window from bulk forecast hours like calendar pills', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'UTC',
      fetchedAt: '2026-07-07T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: [
        hour('2026-07-16T06:00:00.000Z', 18),
        hour('2026-07-16T12:00:00.000Z', 24),
        hour('2026-07-16T18:00:00.000Z', 20),
        hour('2026-07-17T08:00:00.000Z', 19),
      ],
      attribution: 'Open-Meteo',
    };

    const dayWindow = buildForecastWindowForDayKey(forecastWindow, '2026-07-16');

    expect(dayWindow?.available).toBe(true);
    expect(dayWindow?.hours).toHaveLength(3);
    expect(dayWindow?.summary?.temperatureC).toBe(24);
  });

  it('returns null when the day is outside the forecast range', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'UTC',
      fetchedAt: '2026-07-07T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: [hour('2026-07-16T12:00:00.000Z', 24)],
      attribution: 'Open-Meteo',
    };

    expect(buildForecastWindowForDayKey(forecastWindow, '2026-07-20')).toBeNull();
  });

  it('returns null for a trailing local forecast day that is not complete', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'Europe/Belgrade',
      fetchedAt: '2026-07-07T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: forecastHours('2026-07-07T00:00:00.000Z', 240),
      attribution: 'Open-Meteo',
    };

    expect(buildForecastWindowForDayKey(forecastWindow, '2026-07-17')).toBeNull();
    expect(buildForecastWindowForDayKey(forecastWindow, '2026-07-16')?.hours.at(-1)?.time).toBe('2026-07-16T21:00:00.000Z');
  });
});

describe('buildCalendarWeatherByDay', () => {
  it('prefers forecast data for overlapping days and fills past archive days', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'UTC',
      fetchedAt: '2026-06-12T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: [
        hour('2026-06-12T09:00:00.000Z', 20),
        hour('2026-06-12T15:00:00.000Z', 26),
      ],
      attribution: 'Open-Meteo',
    };

    const pastDay: WeatherDay = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'UTC',
      date: '2026-06-10',
      fetchedAt: '2026-06-10T10:00:00.000Z',
      stale: false,
      source: 'archive',
      available: true,
      hours: [hour('2026-06-10T12:00:00.000Z', 14)],
      attribution: 'Open-Meteo',
    };

    const map = buildCalendarWeatherByDay({
      dayKeys: ['2026-06-10', '2026-06-12', '2026-06-20'],
      forecastWindow,
      pastDaysByKey: new Map([['2026-06-10', pastDay]]),
    });

    expect(map.get('2026-06-10')?.point.temperatureC).toBe(14);
    expect(map.get('2026-06-12')?.point.temperatureC).toBe(26);
    expect(map.has('2026-06-20')).toBe(false);
  });

  it('returns an empty map when no sources are available', () => {
    const map = buildCalendarWeatherByDay({
      dayKeys: ['2026-06-10'],
      forecastWindow: {
        provider: 'open-meteo',
        cityId: 'city-1',
        cityName: 'Belgrade',
        cityTimezone: 'UTC',
        fetchedAt: '2026-06-10T10:00:00.000Z',
        stale: false,
        source: 'forecast',
        available: false,
        summary: null,
        hours: [],
        attribution: 'Open-Meteo',
      },
    });

    expect(map.size).toBe(0);
  });

  it('ignores days outside the visible grid', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'UTC',
      fetchedAt: '2026-06-12T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: [hour('2026-06-12T12:00:00.000Z', 21)],
      attribution: 'Open-Meteo',
    };

    const map = buildCalendarWeatherByDay({
      dayKeys: ['2026-06-11'],
      forecastWindow,
    });

    expect(map.size).toBe(0);
  });

  it('does not create calendar pills for trailing local forecast days that are not complete', () => {
    const forecastWindow: WeatherWindow = {
      provider: 'open-meteo',
      cityId: 'city-1',
      cityName: 'Belgrade',
      cityTimezone: 'Europe/Belgrade',
      fetchedAt: '2026-07-07T10:00:00.000Z',
      stale: false,
      source: 'forecast',
      available: true,
      summary: null,
      hours: forecastHours('2026-07-07T00:00:00.000Z', 240),
      attribution: 'Open-Meteo',
    };

    const map = buildCalendarWeatherByDay({
      dayKeys: ['2026-07-16', '2026-07-17'],
      forecastWindow,
    });

    expect(map.has('2026-07-16')).toBe(true);
    expect(map.has('2026-07-17')).toBe(false);
  });
});
