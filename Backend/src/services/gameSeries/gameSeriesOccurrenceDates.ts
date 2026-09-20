import { fromZonedTime } from 'date-fns-tz';
import { formatCalendarDayKey } from '../game/calendarDayKey';

/**
 * PRD 345 — occurrence date math for recurring game series.
 *
 * Everything here works on **club-local day keys** (`YYYY-MM-DD`) and plain
 * integers, never on `Date` arithmetic. That is deliberate: a weekly series is
 * a statement about the *wall clock* ("every Tuesday at 19:00"), so adding
 * `7 * 24 * 60 * 60 * 1000` milliseconds is wrong across a DST boundary — it
 * would drift the local time by an hour twice a year.
 *
 * The only place a real instant appears is {@link occurrenceStartUtc}, which
 * converts one local `(dayKey, HH:mm)` pair in the club timezone into the UTC
 * instant stored on `Game.startTime`. `date-fns-tz`'s `fromZonedTime` resolves
 * the DST offset **for that specific local date**, which is exactly the
 * semantics we want.
 */

export type GameSeriesCadenceValue = 'WEEKLY' | 'BIWEEKLY';

export const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD`, club-local. */
export type DayKey = string;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string') return false;
  const match = DAY_KEY_PATTERN.exec(value);
  if (!match) return false;
  return toDayKey(dayKeyToEpochDay(value)) === value;
}

export function isLocalTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/** Days since 1970-01-01, derived from the calendar fields only (no timezone). */
export function dayKeyToEpochDay(dayKey: DayKey): number {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) throw new RangeError(`Invalid day key: ${dayKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function toDayKey(epochDay: number): DayKey {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDaysToDayKey(dayKey: DayKey, days: number): DayKey {
  return toDayKey(dayKeyToEpochDay(dayKey) + days);
}

export function diffDayKeys(later: DayKey, earlier: DayKey): number {
  return dayKeyToEpochDay(later) - dayKeyToEpochDay(earlier);
}

/** ISO-8601 weekday: 1 = Monday … 7 = Sunday. 1970-01-01 was a Thursday (4). */
export function isoWeekdayOfDayKey(dayKey: DayKey): number {
  const epochDay = dayKeyToEpochDay(dayKey);
  return (((epochDay + 3) % 7) + 7) % 7 + 1;
}

/** The club-local calendar day an instant falls on. */
export function dayKeyInTimezone(instant: Date, timezone: string): DayKey {
  return formatCalendarDayKey(instant, timezone);
}

/** Midnight-anchored `@db.Date` value for Prisma (Postgres `DATE` ignores the time). */
export function dayKeyToPrismaDate(dayKey: DayKey): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function prismaDateToDayKey(value: Date): DayKey {
  return value.toISOString().slice(0, 10);
}

export const cadenceStepDays = (cadence: GameSeriesCadenceValue): number =>
  cadence === 'BIWEEKLY' ? 14 : 7;

/**
 * Move `anchorDayKey` to the weekday the series runs on, staying in the anchor's
 * own week (Monday-based). Used when the organizer changes the weekday chip.
 */
export function alignDayKeyToWeekday(anchorDayKey: DayKey, isoWeekday: number): DayKey {
  const current = isoWeekdayOfDayKey(anchorDayKey);
  return addDaysToDayKey(anchorDayKey, isoWeekday - current);
}

/**
 * The first `isoWeekday` **strictly after** `dayKey`.
 *
 * Used when a game is converted into a series on a *different* weekday: the
 * seeding game keeps its own date as occurrence #1, so the cadence grid has to
 * start on the next chosen weekday. Aligning inside the seed's own week instead
 * would put a second occurrence in that week (a Thursday game turned into a
 * Tuesday series would generate the Tuesday two days earlier or later the same
 * week) and shift the "week N" numbering by one from then on.
 */
export function nextWeekdayAfterDayKey(dayKey: DayKey, isoWeekday: number): DayKey {
  const aligned = alignDayKeyToWeekday(dayKey, isoWeekday);
  // Day keys are `YYYY-MM-DD`, so lexicographic order is chronological order.
  return aligned > dayKey ? aligned : addDaysToDayKey(aligned, 7);
}

/**
 * First occurrence on or after `fromDayKey`, preserving the cadence phase set by
 * `anchorDayKey`. Works for anchors in the past and in the future.
 */
export function nextOccurrenceOnOrAfter(
  anchorDayKey: DayKey,
  cadence: GameSeriesCadenceValue,
  fromDayKey: DayKey,
): DayKey {
  const step = cadenceStepDays(cadence);
  const delta = diffDayKeys(fromDayKey, anchorDayKey);
  if (delta <= 0) return anchorDayKey;
  const steps = Math.ceil(delta / step);
  return addDaysToDayKey(anchorDayKey, steps * step);
}

export interface ListOccurrenceDayKeysInput {
  anchorDayKey: DayKey;
  cadence: GameSeriesCadenceValue;
  /** Inclusive lower bound, club-local. */
  fromDayKey: DayKey;
  /** Inclusive upper bound, club-local. */
  throughDayKey: DayKey;
  /** Inclusive last day the series may run (`GameSeries.endsOn`). */
  endsOnDayKey?: DayKey | null;
  /** Day keys the organizer explicitly skipped (`GameSeriesSkip`). */
  skipDayKeys?: readonly DayKey[];
  /** Hard cap so a nonsense horizon can never spin. */
  maxCount?: number;
}

export const MAX_OCCURRENCES_PER_PASS = 64;

/**
 * Every occurrence day key inside `[fromDayKey, throughDayKey]`, ascending.
 * Pure: no clock, no timezone, no database.
 */
export function listOccurrenceDayKeys({
  anchorDayKey,
  cadence,
  fromDayKey,
  throughDayKey,
  endsOnDayKey = null,
  skipDayKeys = [],
  maxCount = MAX_OCCURRENCES_PER_PASS,
}: ListOccurrenceDayKeysInput): DayKey[] {
  if (diffDayKeys(throughDayKey, fromDayKey) < 0) return [];

  const step = cadenceStepDays(cadence);
  const skipped = new Set(skipDayKeys);
  const out: DayKey[] = [];

  let cursor = nextOccurrenceOnOrAfter(anchorDayKey, cadence, fromDayKey);
  while (out.length < maxCount && diffDayKeys(throughDayKey, cursor) >= 0) {
    if (endsOnDayKey && diffDayKeys(cursor, endsOnDayKey) > 0) break;
    if (!skipped.has(cursor)) out.push(cursor);
    cursor = addDaysToDayKey(cursor, step);
  }

  return out;
}

/** Inclusive last day of the generation window. */
export function horizonThroughDayKey(fromDayKey: DayKey, horizonDays: number): DayKey {
  const days = Number.isFinite(horizonDays) ? Math.max(0, Math.trunc(horizonDays)) : 0;
  return addDaysToDayKey(fromDayKey, days);
}

/**
 * UTC instant for `HH:mm` local time on `dayKey` in `timezone`.
 *
 * DST-correct by construction: `fromZonedTime` looks up the offset in force on
 * that local date, so "19:00 every Tuesday" stays 19:00 on the club wall clock
 * while the stored UTC instant shifts by an hour across the boundary.
 */
export function occurrenceStartUtc(
  dayKey: DayKey,
  startTimeLocal: string,
  timezone: string,
): Date {
  if (!isLocalTimeString(startTimeLocal)) {
    throw new RangeError(`Invalid local time: ${startTimeLocal}`);
  }
  return fromZonedTime(`${dayKey}T${startTimeLocal}:00`, timezone || 'UTC');
}

export function occurrenceEndUtc(startUtc: Date, durationMinutes: number): Date {
  const minutes = Number.isFinite(durationMinutes) ? Math.max(1, Math.trunc(durationMinutes)) : 60;
  return new Date(startUtc.getTime() + minutes * 60_000);
}

/** `HH:mm` of an instant as read on the club wall clock. */
export function localTimeInTimezone(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/**
 * The moment unclaimed regular seats stop being held, i.e. `seatDeadlineHours`
 * before the occurrence starts.
 */
export function seatDeadlineFor(startUtc: Date, seatDeadlineHours: number): Date {
  const hours = Number.isFinite(seatDeadlineHours)
    ? Math.min(168, Math.max(0, Math.trunc(seatDeadlineHours)))
    : 48;
  return new Date(startUtc.getTime() - hours * 3_600_000);
}
