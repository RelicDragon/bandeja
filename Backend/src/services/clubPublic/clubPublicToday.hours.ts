/**
 * PRD 354 — pure hour-bucket maths for the "Today at a glance" strip.
 *
 * Kept free of `config/database` so the bucket/DST logic is unit-testable
 * without a connection string. `clubPublicToday.service.ts` owns the queries.
 */
import { fromZonedTime } from 'date-fns-tz';

/** Fallback window when a club has no opening hours on file. */
export const DEFAULT_OPEN_HOUR = 7;
export const DEFAULT_CLOSE_HOUR = 23;

export type ClubTodayHour = {
  /** Hour of day in the club's timezone, 0–23. */
  hour: number;
  busy: boolean;
};

export type BusyInterval = { start: number; end: number };

export type HourBucket = { hour: number; start: number; end: number };

/**
 * `"08:30"` → `8`. Anything unparseable falls back, so a club with junk in
 * `openingTime` still gets a sane strip instead of an empty one.
 */
export function parseClubHour(value: string | null | undefined, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 24) return fallback;
  return hour;
}

/** Inclusive-start, exclusive-end hour window, always at least one hour wide. */
export function resolveClubHourWindow(
  openingTime: string | null | undefined,
  closingTime: string | null | undefined,
): { openHour: number; closeHour: number } {
  const openHour = parseClubHour(openingTime, DEFAULT_OPEN_HOUR);
  const rawClose = parseClubHour(closingTime, DEFAULT_CLOSE_HOUR);
  // A club that closes after midnight ("02:00") is rendered to end of day
  // rather than wrapping — the strip covers today only.
  const closeHour = rawClose > openHour ? rawClose : 24;
  return { openHour, closeHour };
}

/**
 * Hour buckets as epoch-millisecond boundaries, built with one `fromZonedTime`
 * call per hour so a DST transition inside the day does not shear the strip.
 */
export function buildHourBuckets(
  dateKey: string,
  timezone: string,
  openHour: number,
  closeHour: number,
): HourBucket[] {
  const [y, m, d] = dateKey.split('-').map(Number);
  // `new Date(y, m - 1, d + 1, …)` rolls the month over on its own, so hour 24
  // resolves to the next local midnight rather than an invalid 24:00.
  const at = (hour: number) =>
    fromZonedTime(
      hour >= 24
        ? new Date(y, m - 1, d + 1, hour - 24, 0, 0, 0)
        : new Date(y, m - 1, d, hour, 0, 0, 0),
      timezone,
    ).getTime();

  const buckets: HourBucket[] = [];
  for (let h = openHour; h < closeHour; h += 1) {
    buckets.push({ hour: h, start: at(h), end: at(h + 1) });
  }
  return buckets;
}

/** An hour bucket is busy when any hard block overlaps any part of it. */
export function markBusyHours(buckets: HourBucket[], intervals: BusyInterval[]): ClubTodayHour[] {
  return buckets.map((bucket) => ({
    hour: bucket.hour,
    busy: intervals.some((iv) => iv.start < bucket.end && iv.end > bucket.start),
  }));
}
