import { describe, expect, it } from 'vitest';
import { resolveCalendarDayPillVisibility } from './calendarDayPillVisibility';

describe('resolveCalendarDayPillVisibility', () => {
  const weather = { point: { time: '2026-07-07T12:00:00.000Z' } };

  it('shows entity pill when weather mode is off', () => {
    expect(resolveCalendarDayPillVisibility({
      weatherMode: false,
      hasGames: true,
      typePillCount: 1,
      dayWeather: null,
    })).toEqual({ showWeatherPill: false, showTypePill: true });
  });

  it('shows weather pill instead of entity pill when weather exists', () => {
    expect(resolveCalendarDayPillVisibility({
      weatherMode: true,
      hasGames: true,
      typePillCount: 2,
      dayWeather: weather,
    })).toEqual({ showWeatherPill: true, showTypePill: false });
  });

  it('keeps entity pill while weather is still unavailable for the day', () => {
    expect(resolveCalendarDayPillVisibility({
      weatherMode: true,
      hasGames: true,
      typePillCount: 1,
      dayWeather: null,
    })).toEqual({ showWeatherPill: false, showTypePill: true });
  });

  it('shows nothing when there are no games', () => {
    expect(resolveCalendarDayPillVisibility({
      weatherMode: true,
      hasGames: false,
      typePillCount: 0,
      dayWeather: weather,
    })).toEqual({ showWeatherPill: true, showTypePill: false });
  });
});
