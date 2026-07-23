import { fromZonedTime } from 'date-fns-tz';
import { DEFAULT_TIMEZONE } from '../../utils/constants';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class InvalidCalendarDateError extends Error {
  constructor(dateKey: string) {
    super(`Invalid calendar date: ${dateKey}`);
    this.name = 'InvalidCalendarDateError';
  }
}

/**
 * Parse API `yyyy-MM-dd` into an inclusive start/end Instant for a city calendar day.
 * Avoids `new Date('yyyy-MM-dd')` + `setHours` (host-TZ dependent / wrong day).
 */
export function calendarDateBounds(
  startDate: string | undefined,
  endDate: string | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): { gte?: Date; lte?: Date } {
  const tz = timeZone || DEFAULT_TIMEZONE;
  const range: { gte?: Date; lte?: Date } = {};
  if (startDate) range.gte = startOfCalendarDate(startDate, tz);
  if (endDate) range.lte = endOfCalendarDate(endDate, tz);
  return range;
}

export function startOfCalendarDate(dateKey: string, timeZone: string): Date {
  const { y, m, d } = parseDateOnlyParts(dateKey);
  return fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), timeZone);
}

export function endOfCalendarDate(dateKey: string, timeZone: string): Date {
  const { y, m, d } = parseDateOnlyParts(dateKey);
  return fromZonedTime(new Date(y, m - 1, d, 23, 59, 59, 999), timeZone);
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function parseDateOnlyParts(dateKey: string): { y: number; m: number; d: number } {
  const match = DATE_ONLY.exec(dateKey.trim());
  if (!match) {
    throw new InvalidCalendarDateError(dateKey);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const maxDay = m === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[m - 1] ?? 0;
  if (!y || m < 1 || m > 12 || d < 1 || d > maxDay) {
    throw new InvalidCalendarDateError(dateKey);
  }
  return { y, m, d };
}
