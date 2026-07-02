import { describe, expect, it } from 'vitest';
import { weatherDayQueryOptions, weatherPreviewQueryOptions } from './useWeatherQuery';

describe('weatherDayQueryOptions', () => {
  it('caches day weather by city and date for one hour', () => {
    const options = weatherDayQueryOptions('city-1', '2026-06-15');

    expect(options.queryKey).toEqual(['weather', 'day', 'city-1', '2026-06-15']);
    expect(options.staleTime).toBe(60 * 60 * 1000);
  });
});

describe('weatherPreviewQueryOptions', () => {
  it('caches preview weather by city and schedule for one hour', () => {
    const options = weatherPreviewQueryOptions({
      cityId: 'city-1',
      startTime: '2026-07-01T18:00:00.000Z',
      endTime: '2026-07-01T19:30:00.000Z',
    });

    expect(options.queryKey).toEqual([
      'weather',
      'preview',
      'city-1',
      '2026-07-01T18:00:00.000Z',
      '2026-07-01T19:30:00.000Z',
      'game',
    ]);
    expect(options.staleTime).toBe(60 * 60 * 1000);
  });
});
