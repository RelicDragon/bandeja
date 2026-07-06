import { describe, expect, it } from 'vitest';
import {
  formatWeatherPrecipitationAmount,
  formatWeatherTime,
  getWeatherPrecipitationValue,
  hasWeatherPrecipitation,
  resolveWeatherPrecipitationMode,
} from './weather';

describe('formatWeatherTime', () => {
  it('formats hourly points in the city timezone', () => {
    const formatted = formatWeatherTime('2026-07-01T15:00:00.000Z', 'en-GB', false, 'Europe/Belgrade');
    expect(formatted).toMatch(/17:00|5:00\s*pm/i);
  });

  it('falls back to UTC when timezone is missing', () => {
    expect(formatWeatherTime('2026-07-01T15:00:00.000Z', 'en-GB', false)).toBe('15:00');
  });
});

describe('weather precipitation display', () => {
  it('uses probability for forecast and mm for archive', () => {
    expect(resolveWeatherPrecipitationMode('forecast')).toBe('probability');
    expect(resolveWeatherPrecipitationMode('archive')).toBe('amount');
  });

  it('reads archive precipitation from mm field', () => {
    const point = {
      precipitationProbability: null,
      precipitationMm: 0.4,
    };

    expect(getWeatherPrecipitationValue(point, 'amount')).toBe(0.4);
    expect(hasWeatherPrecipitation(point, 'amount')).toBe(true);
    expect(formatWeatherPrecipitationAmount(0.4, 'en-GB')).toBe('0.4');
  });
});
