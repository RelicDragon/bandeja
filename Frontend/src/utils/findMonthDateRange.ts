import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';

export type WeekStartsOn = 0 | 1;

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
