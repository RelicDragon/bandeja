/**
 * Club-timezone helpers for the slot engine (docs/plans/ai-agent-booking.md §14.9).
 *
 * Times inside the engine are "business-day minutes": minutes after local midnight of the
 * requested date, which may exceed 1440 for clubs that close after midnight (01:30 on the
 * next calendar day is 1530). Every candidate is converted with one `fromZonedTime` call in
 * the **club's** city timezone; nonexistent (spring-forward gap) and ambiguous (fall-back
 * repeat) wall-clock times are rejected rather than guessed.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const HOUR_MS = 60 * 60 * 1000;

export const MINUTES_PER_DAY = 1440;

export function isCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** `HH:mm` (or `HH:mm:ss`) → minutes after midnight; `24:00` is accepted as 1440. */
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '24:00') return MINUTES_PER_DAY;
  const match = TIME_RE.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function clockLabel(minutes: number): string {
  const inDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
}

/** Local calendar date + clock of a business-day minute (1530 on 2026-10-24 → 2026-10-25 01:30). */
export function businessMinuteToLocal(date: string, minutes: number): { date: string; time: string } {
  return { date: addDays(date, Math.floor(minutes / MINUTES_PER_DAY)), time: clockLabel(minutes) };
}

/**
 * Wall-clock time in `timeZone` → instant, or null when that local time does not exist
 * (DST gap) or happens twice (DST repeat).
 */
export function zonedInstant(date: string, time: string, timeZone: string): Date | null {
  const local = `${date} ${time}`;
  const instant = fromZonedTime(`${date}T${time}:00`, timeZone);
  if (!Number.isFinite(instant.getTime())) return null;
  if (formatInTimeZone(instant, timeZone, 'yyyy-MM-dd HH:mm') !== local) return null; // gap
  for (const shift of [-HOUR_MS, HOUR_MS]) {
    if (formatInTimeZone(new Date(instant.getTime() + shift), timeZone, 'yyyy-MM-dd HH:mm') === local) {
      return null; // the same wall-clock time also exists one hour away: ambiguous
    }
  }
  return instant;
}

/** Instant of a business-day minute, with the same DST rejection. */
export function businessMinuteInstant(date: string, minutes: number, timeZone: string): Date | null {
  const local = businessMinuteToLocal(date, minutes);
  return zonedInstant(local.date, local.time, timeZone);
}

/**
 * A `[startMinute, startMinute + duration)` slot as instants. Null when either end falls on a
 * DST gap/repeat or the slot crosses a transition (real length ≠ wall-clock length): the
 * provider and the player would disagree about when it ends.
 */
export function slotInstants(
  date: string,
  startMinute: number,
  durationMinutes: number,
  timeZone: string,
): { start: Date; end: Date } | null {
  const start = businessMinuteInstant(date, startMinute, timeZone);
  const end = businessMinuteInstant(date, startMinute + durationMinutes, timeZone);
  if (!start || !end) return null;
  if (end.getTime() - start.getTime() !== durationMinutes * 60_000) return null;
  return { start, end };
}

/** Local midnight of `date` (never inside a DST gap in the zones we serve; falls back to the UTC offset). */
export function localMidnight(date: string, timeZone: string): Date {
  return fromZonedTime(`${date}T00:00:00`, timeZone);
}

export function todayInZone(now: Date, timeZone: string): string {
  return formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
}

export function formatClockInZone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, 'HH:mm');
}

export type BusinessHours = { open: number; close: number; known: boolean };

/** Hours used when a club has no opening/closing time (snapshot / app-only clubs). */
export const DEFAULT_BUSINESS_HOURS = { open: 7 * 60, close: 23 * 60 } as const;

/**
 * Flat `Club.openingTime` / `closingTime`. A closing time at or before the opening time means
 * the club closes after midnight (`08:00`–`02:00` → 480..1560). `00:00`–`00:00` is 24h.
 */
export function resolveBusinessHours(openingTime: string | null | undefined, closingTime: string | null | undefined): BusinessHours {
  const open = parseClock(openingTime);
  const close = parseClock(closingTime);
  if (open == null || close == null) {
    return { ...DEFAULT_BUSINESS_HOURS, known: false };
  }
  return { open, close: close <= open ? close + MINUTES_PER_DAY : close, known: true };
}

/**
 * The player's `timeFrom` / `timeTo` as business-day minutes on the same axis as the hours:
 * a time before the opening time belongs to the after-midnight tail. `timeTo` before
 * `timeFrom` wraps past midnight too.
 */
export function resolveTimeWindow(
  hours: BusinessHours,
  timeFrom?: string | null,
  timeTo?: string | null,
): { from: number; to: number } | null {
  if (!timeFrom && !timeTo) return null;
  const toAxis = (value: number): number => (value < hours.open && hours.close > MINUTES_PER_DAY && value + MINUTES_PER_DAY <= hours.close ? value + MINUTES_PER_DAY : value);
  const fromRaw = timeFrom ? parseClock(timeFrom) : null;
  const toRaw = timeTo ? parseClock(timeTo) : null;
  const from = fromRaw == null ? hours.open : toAxis(fromRaw);
  let to = toRaw == null ? hours.close : toAxis(toRaw);
  if (to < from) to += MINUTES_PER_DAY;
  return { from, to };
}
