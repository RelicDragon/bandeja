import { describe, expect, it, vi, afterEach } from 'vitest';
import { calendarDayWeatherAnchor, isCalendarDayBeforeToday } from './calendarDayWeather';

describe('calendarDayWeatherAnchor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a midday preview window for the selected calendar day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T10:00:00'));

    const anchor = calendarDayWeatherAnchor(new Date('2026-07-07T10:00:00'));

    expect(anchor).toEqual({
      dayKey: '2026-07-07',
      startTime: '2026-07-07T12:00:00.000Z',
      endTime: '2026-07-07T13:00:00.000Z',
    });
  });

  it('detects calendar days before today in city timezone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));

    expect(isCalendarDayBeforeToday('2026-07-06', 'UTC')).toBe(true);
    expect(isCalendarDayBeforeToday('2026-07-07', 'UTC')).toBe(false);
    expect(isCalendarDayBeforeToday('2026-07-08', 'UTC')).toBe(false);
  });
});
