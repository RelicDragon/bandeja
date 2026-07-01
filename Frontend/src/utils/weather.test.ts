import { describe, expect, it } from 'vitest';
import { formatWeatherTime } from './weather';

describe('formatWeatherTime', () => {
  it('formats hourly points in the city timezone', () => {
    const formatted = formatWeatherTime('2026-07-01T15:00:00.000Z', 'en-GB', false, 'Europe/Belgrade');
    expect(formatted).toMatch(/17:00|5:00\s*pm/i);
  });

  it('falls back to UTC when timezone is missing', () => {
    expect(formatWeatherTime('2026-07-01T15:00:00.000Z', 'en-GB', false)).toBe('15:00');
  });
});
