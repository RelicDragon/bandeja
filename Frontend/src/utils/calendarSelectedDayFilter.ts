import { format, getDate, getDaysInMonth, set, startOfDay, startOfMonth } from 'date-fns';
import type { Game } from '@/types';

export const calendarDayKey = (date: Date): string =>
  format(startOfDay(date), 'yyyy-MM-dd');

export const gameCalendarDayKey = (game: Game): string =>
  calendarDayKey(new Date(game.startTime));

/** Keep selected day-of-month when paging the calendar (clamp to target month length). */
export function selectedDayInMonth(anchor: Date, month: Date): Date {
  const monthStart = startOfMonth(month);
  const day = Math.min(getDate(anchor), getDaysInMonth(monthStart));
  return startOfDay(set(monthStart, { date: day }));
}

export function filterGamesForCalendarDay(games: Game[], selectedDate: Date): Game[] {
  const selectedKey = calendarDayKey(selectedDate);
  return games.filter((game) => {
    if (game.timeIsSet === false) return false;
    return gameCalendarDayKey(game) === selectedKey;
  });
}

export function unionDateRangeWithDay(
  startDate: Date,
  endDate: Date,
  day: Date,
): { startDate: Date; endDate: Date } {
  const dayStart = startOfDay(day);
  const rangeStart = startOfDay(startDate);
  const rangeEnd = startOfDay(endDate);
  return {
    startDate: dayStart < rangeStart ? dayStart : rangeStart,
    endDate: dayStart > rangeEnd ? dayStart : rangeEnd,
  };
}
