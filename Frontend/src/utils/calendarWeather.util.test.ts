import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildCalendarWeatherByDay,
  calendarDayWeatherFromDay,
  pickRepresentativeWeatherHour,
  splitCalendarDayKeys,
} from './calendarWeather.util';
import type { WeatherDay, WeatherHourlyPoint, WeatherWindow } from '@/types';

function hour(time: string, temperatureC: number): WeatherHourlyPoint {
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
    isDay: true,
  };
}

describe('pickRepresentativeWeatherHour', () => {
  it('picks the middle hour for a day', () => {
    const hours = [
      hour('2026-06-15T06:00:00.000Z', 10),
      hour('2026-06-15T12:00:00.000Z', 22),
      hour('2026-06-15T18:00:00.000Z', 18),
    ];

    expect(pickRepresentativeWeatherHour(hours)?.temperatureC).toBe(22);
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
});
