import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { buildSelectedDateWeatherMetaItems } from './selectedDateWeatherMeta';
import type { WeatherSummary } from '@/types';

vi.mock('@/components/weather/WeatherPrecipitationInline', () => ({
  WeatherPrecipitationInline: (props: { point: { precipitationProbability?: number | null } }) =>
    createElement('span', {
      'data-testid': 'precip',
      children: String(props.point.precipitationProbability ?? ''),
    }),
}));

const t = ((key: string, opts?: { speed?: number; defaultValue?: string }) => {
  if (key === 'weather.windSpeed') return `${opts?.speed ?? 0} km/h`;
  return opts?.defaultValue ?? key;
}) as never;

function summary(partial: Partial<WeatherSummary>): WeatherSummary {
  return {
    time: '2026-08-28T12:00:00Z',
    temperatureC: 34,
    temperatureF: 93,
    precipitationProbability: 0,
    precipitationMm: 0,
    weatherCode: 0,
    conditionKey: 'clear',
    isDay: true,
    windSpeedKmh: 13,
    relativeHumidity: 40,
    provider: 'open-meteo',
    fetchedAt: '2026-08-28T10:00:00Z',
    stale: false,
    ...partial,
  };
}

describe('buildSelectedDateWeatherMetaItems', () => {
  it('omits zero precip and keeps condition, range, wind', () => {
    const items = buildSelectedDateWeatherMetaItems({
      condition: 'Clear',
      dayRange: { low: '24', high: '36' },
      summary: summary({ precipitationProbability: 0, windSpeedKmh: 13 }),
      precipMode: 'probability',
      locale: 'en-GB',
      t,
    });
    const keys = items.map((node) => (node as { key?: string | null }).key);
    expect(keys).toEqual(['condition', 'range', 'wind']);
  });

  it('includes precip when probability > 0 and drops calm wind', () => {
    const items = buildSelectedDateWeatherMetaItems({
      condition: 'Rain',
      dayRange: null,
      summary: summary({ precipitationProbability: 40, windSpeedKmh: 0, conditionKey: 'rain' }),
      precipMode: 'probability',
      locale: 'en-GB',
      t,
    });
    const keys = items.map((node) => (node as { key?: string | null }).key);
    expect(keys).toEqual(['condition', 'precip']);
  });
});
