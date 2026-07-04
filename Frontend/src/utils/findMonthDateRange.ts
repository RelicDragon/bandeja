import { endOfMonth, endOfWeek, parse, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export type WeekStartsOn = 0 | 1;

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

export function isFindGamesQueryReady(input: {
  isHydrated: boolean;
  calendarRangeReady: boolean;
  userId: string | undefined;
}): boolean {
  return input.isHydrated && input.calendarRangeReady && Boolean(input.userId);
}
