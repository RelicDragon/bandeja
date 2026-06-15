import { describe, expect, it } from 'vitest';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { computeFindMonthDateRange, isFindGamesQueryReady } from './findMonthDateRange';

describe('computeFindMonthDateRange', () => {
  it('matches MonthCalendar grid bounds for monday week start', () => {
    const anchor = new Date('2026-06-15');
    const weekStartsOn = 1 as const;
    const { startDate, endDate } = computeFindMonthDateRange(anchor, weekStartsOn);

    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    expect(format(startDate, 'yyyy-MM-dd')).toBe(
      format(startOfWeek(monthStart, { weekStartsOn }), 'yyyy-MM-dd'),
    );
    expect(format(endDate, 'yyyy-MM-dd')).toBe(
      format(endOfWeek(monthEnd, { weekStartsOn }), 'yyyy-MM-dd'),
    );
  });

  it('differs from sunday week start for the same anchor month', () => {
    const anchor = new Date('2026-06-15');
    const monday = computeFindMonthDateRange(anchor, 1);
    const sunday = computeFindMonthDateRange(anchor, 0);
    expect(format(monday.startDate, 'yyyy-MM-dd')).not.toBe(
      format(sunday.startDate, 'yyyy-MM-dd'),
    );
  });
});

describe('isFindGamesQueryReady', () => {
  it('is false until filters hydrated, calendar range reported, and user present', () => {
    expect(
      isFindGamesQueryReady({ isHydrated: false, calendarRangeReady: false, userId: 'u1' }),
    ).toBe(false);
    expect(
      isFindGamesQueryReady({ isHydrated: true, calendarRangeReady: false, userId: 'u1' }),
    ).toBe(false);
    expect(
      isFindGamesQueryReady({ isHydrated: true, calendarRangeReady: true, userId: undefined }),
    ).toBe(false);
    expect(
      isFindGamesQueryReady({ isHydrated: true, calendarRangeReady: true, userId: 'u1' }),
    ).toBe(true);
  });
});
