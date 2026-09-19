import { describe, expect, it } from 'vitest';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import {
  computeFindMonthDateRange,
  findMonthRangeEquals,
  isFindGamesQueryReady,
  resolveFindMonthRangeAnchor,
} from './findMonthDateRange';

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

describe('resolveFindMonthRangeAnchor', () => {
  it('uses the restored selected day when present', () => {
    const fallback = new Date('2026-07-04T12:00:00.000Z');

    expect(format(resolveFindMonthRangeAnchor('2026-05-17', fallback), 'yyyy-MM-dd')).toBe(
      '2026-05-17',
    );
  });

  it('falls back when the selected day is missing or invalid', () => {
    const fallback = new Date('2026-07-04T12:00:00.000Z');

    expect(format(resolveFindMonthRangeAnchor(null, fallback), 'yyyy-MM-dd')).toBe('2026-07-04');
    expect(format(resolveFindMonthRangeAnchor('not-a-date', fallback), 'yyyy-MM-dd')).toBe(
      '2026-07-04',
    );
  });
});

describe('isFindGamesQueryReady', () => {
  it('is false until filters hydrated and user present', () => {
    expect(isFindGamesQueryReady({ isHydrated: false, userId: 'u1' })).toBe(false);
    expect(isFindGamesQueryReady({ isHydrated: true, userId: undefined })).toBe(false);
    expect(isFindGamesQueryReady({ isHydrated: true, userId: 'u1' })).toBe(true);
  });

  it('does not wait for the calendar to report its grid range', () => {
    // The seeded range already addresses the right month query key, so the
    // month/day fetches start on the first render.
    expect(isFindGamesQueryReady({ isHydrated: true, userId: 'u1' })).toBe(true);
  });
});

describe('findMonthRangeEquals', () => {
  it('treats ranges with equal day keys as the same request', () => {
    const a = computeFindMonthDateRange(new Date('2026-06-15T00:00:00.000Z'), 1);
    const b = computeFindMonthDateRange(new Date('2026-06-02T23:30:00.000Z'), 1);
    expect(findMonthRangeEquals(a, b)).toBe(true);
  });

  it('separates different months and week starts', () => {
    const june = computeFindMonthDateRange(new Date('2026-06-15'), 1);
    const july = computeFindMonthDateRange(new Date('2026-07-15'), 1);
    const juneSunday = computeFindMonthDateRange(new Date('2026-06-15'), 0);
    expect(findMonthRangeEquals(june, july)).toBe(false);
    expect(findMonthRangeEquals(june, juneSunday)).toBe(false);
  });

  it('handles partially populated ranges', () => {
    const june = computeFindMonthDateRange(new Date('2026-06-15'), 1);
    expect(findMonthRangeEquals({}, {})).toBe(true);
    expect(findMonthRangeEquals({}, june)).toBe(false);
    expect(findMonthRangeEquals({ startDate: june.startDate }, june)).toBe(false);
  });
});
