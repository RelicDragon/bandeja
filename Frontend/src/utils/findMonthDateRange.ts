import { endOfMonth, endOfWeek, format, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export type WeekStartsOn = 0 | 1 | 6;

export type FindMonthDateRange = { startDate?: Date; endDate?: Date };

export function resolveFindMonthRangeAnchor(
  selectedDayKey: string | null | undefined,
  fallbackDate: Date,
): Date {
  if (!selectedDayKey) {
    return fallbackDate;
  }

  const parsedDay = startOfDay(parse(selectedDayKey, 'yyyy-MM-dd', fallbackDate));
  return Number.isNaN(parsedDay.getTime()) ? fallbackDate : parsedDay;
}

export function computeFindMonthDateRange(
  anchor: Date,
  weekStartsOn: WeekStartsOn,
): { startDate: Date; endDate: Date } {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  return {
    startDate: startOfWeek(monthStart, { weekStartsOn }),
    endDate: endOfWeek(monthEnd, { weekStartsOn }),
  };
}

const dayKeyOf = (date?: Date): string =>
  date && !Number.isNaN(date.getTime()) ? format(date, 'yyyy-MM-dd') : '';

/**
 * Day-granular comparison — the month query key is built from `yyyy-MM-dd`, so
 * two ranges with the same day keys address the same request. Lets callers keep
 * the previous range object instead of publishing an identical one.
 */
export function findMonthRangeEquals(a: FindMonthDateRange, b: FindMonthDateRange): boolean {
  return dayKeyOf(a.startDate) === dayKeyOf(b.startDate)
    && dayKeyOf(a.endDate) === dayKeyOf(b.endDate);
}

/**
 * The month range is seeded synchronously from the same inputs MonthCalendar
 * derives its grid from, so readiness never waits for the calendar to mount and
 * report back — only for the filter hydration and the viewer.
 */
export function isFindGamesQueryReady(input: {
  isHydrated: boolean;
  userId: string | undefined;
}): boolean {
  return input.isHydrated && Boolean(input.userId);
}
