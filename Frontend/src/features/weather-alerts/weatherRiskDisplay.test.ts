import { describe, expect, it } from 'vitest';
import {
  formatClockTime,
  formatPercent,
  formatWindSpeed,
  hourlyStripWindow,
  shouldShowWeatherPill,
  WEATHER_RISK_POP_THRESHOLD,
  WEATHER_RISK_WIND_KPH_THRESHOLD,
  weatherRiskLabelKey,
  weatherRiskTone,
} from './weatherRiskDisplay';

describe('weatherRiskTone', () => {
  it('reads wind only when rain would not have alerted on its own', () => {
    expect(weatherRiskTone({ pop: 10, windKph: WEATHER_RISK_WIND_KPH_THRESHOLD })).toBe('wind');
    expect(weatherRiskTone({ pop: WEATHER_RISK_POP_THRESHOLD, windKph: 50 })).toBe('rain');
    expect(weatherRiskTone({ pop: 70, windKph: 5 })).toBe('rain');
  });

  it('prefers the backend flag when the payload carries one', () => {
    expect(weatherRiskTone({ pop: 90, windKph: 0, windDriven: true })).toBe('wind');
    expect(weatherRiskTone({ pop: 0, windKph: 90, windDriven: false })).toBe('rain');
  });
});

describe('weatherRiskLabelKey', () => {
  it('names the class', () => {
    expect(weatherRiskLabelKey('likely', 'rain')).toBe('weatherAlerts.rainLikely');
    expect(weatherRiskLabelKey('heavy', 'rain')).toBe('weatherAlerts.heavyRain');
    expect(weatherRiskLabelKey('storm', 'rain')).toBe('weatherAlerts.storm');
  });

  it('always says "strong wind" when wind is the reason', () => {
    expect(weatherRiskLabelKey('storm', 'wind')).toBe('weatherAlerts.strongWind');
    expect(weatherRiskLabelKey('likely', 'wind')).toBe('weatherAlerts.strongWind');
  });
});

describe('shouldShowWeatherPill', () => {
  it('is the only gate the card needs', () => {
    expect(shouldShowWeatherPill(null)).toBe(false);
    expect(shouldShowWeatherPill(undefined)).toBe(false);
    expect(
      shouldShowWeatherPill({ severity: 'none', pop: 0, windKph: 0, at: '2026-09-21T17:00:00Z' }),
    ).toBe(false);
    expect(
      shouldShowWeatherPill({ severity: 'likely', pop: 70, windKph: 8, at: '2026-09-21T17:00:00Z' }),
    ).toBe(true);
  });
});

describe('Intl formatting', () => {
  it('never hard-codes a percent sign or a unit', () => {
    expect(formatPercent(70, 'en')).toContain('70');
    expect(formatPercent(70, 'ru')).toContain('70');
    // Arabic renders both the digits and the sign differently.
    expect(formatPercent(70, 'ar')).not.toBe(formatPercent(70, 'en'));
    expect(formatWindSpeed(42, 'en')).toContain('42');
    expect(formatWindSpeed(42.4, 'en')).toContain('42');
  });

  it('clamps nonsense rather than rendering it', () => {
    expect(formatPercent(-5, 'en')).toBe(formatPercent(0, 'en'));
    expect(formatPercent(180, 'en')).toBe(formatPercent(100, 'en'));
  });

  it('formats the clock in the club timezone', () => {
    const utc = formatClockTime('2026-09-21T17:00:00.000Z', 'en-GB', { timeZone: 'UTC' });
    const belgrade = formatClockTime('2026-09-21T17:00:00.000Z', 'en-GB', {
      timeZone: 'Europe/Belgrade',
    });
    expect(utc).toBe('17:00');
    expect(belgrade).toBe('19:00');
  });

  it('returns an empty string for an unusable timestamp', () => {
    expect(formatClockTime('nope', 'en')).toBe('');
  });
});

describe('hourlyStripWindow', () => {
  const hours = [
    { time: '2026-09-21T15:00:00.000Z' },
    { time: '2026-09-21T16:00:00.000Z' },
    { time: '2026-09-21T17:00:00.000Z' },
    { time: '2026-09-21T18:00:00.000Z' },
    { time: '2026-09-21T19:00:00.000Z' },
    { time: '2026-09-21T20:00:00.000Z' },
  ];

  it('centres four hours on the start time', () => {
    expect(hourlyStripWindow(hours, '2026-09-21T17:00:00.000Z').map((h) => h.time)).toEqual([
      '2026-09-21T16:00:00.000Z',
      '2026-09-21T17:00:00.000Z',
      '2026-09-21T18:00:00.000Z',
      '2026-09-21T19:00:00.000Z',
    ]);
  });

  it('clamps at both ends rather than running off the forecast', () => {
    expect(hourlyStripWindow(hours, '2026-09-21T15:00:00.000Z')).toHaveLength(4);
    expect(hourlyStripWindow(hours, '2026-09-21T15:00:00.000Z')[0].time).toBe(
      '2026-09-21T15:00:00.000Z',
    );
    expect(hourlyStripWindow(hours, '2026-09-21T20:00:00.000Z')[3].time).toBe(
      '2026-09-21T20:00:00.000Z',
    );
  });

  it('returns everything it has when the forecast is short', () => {
    expect(hourlyStripWindow(hours.slice(0, 2), '2026-09-21T15:00:00.000Z')).toHaveLength(2);
    expect(hourlyStripWindow([], '2026-09-21T15:00:00.000Z')).toEqual([]);
  });
});
