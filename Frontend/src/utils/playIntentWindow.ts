import type { PlayIntentTimeOfDay } from '@/api/playIntents';

const MINUTES_IN_DAY = 1440;

/**
 * Convert an "HH:MM" (or "24:00") time string into minutes from midnight.
 * Port of the backend helper in playIntentCriteria.ts so client and server
 * agree on what a time string means.
 */
export function timeStringToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * The end-of-day minute each fixed time-of-day bucket covers.
 * Mirrors resolveTimeWindow() on the backend. CUSTOM is resolved from the
 * provided end time. ANYTIME (and any unmapped value) spans to end of day.
 */
export function resolveTimeWindowEndMinutes(
  timeOfDays: PlayIntentTimeOfDay[],
  endTime?: string | null,
): number {
  if (!timeOfDays.length) return MINUTES_IN_DAY;
  let endMinutes = 0;
  for (const period of timeOfDays) {
    let periodEnd: number;
    switch (period) {
      case 'MORNING':
        periodEnd = 12 * 60;
        break;
      case 'AFTERNOON':
        periodEnd = 18 * 60;
        break;
      case 'EVENING':
        periodEnd = MINUTES_IN_DAY;
        break;
      case 'CUSTOM':
        periodEnd = endTime ? timeStringToMinutes(endTime) : MINUTES_IN_DAY;
        break;
      case 'ANYTIME':
      default:
        periodEnd = MINUTES_IN_DAY;
        break;
    }
    if (periodEnd > endMinutes) endMinutes = periodEnd;
  }
  return endMinutes;
}

/**
 * Shift a "yyyy-MM-dd" date key by `deltaDays`, returning a new date key.
 * Uses noon UTC to avoid DST boundary edge effects on the calendar day.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays, 12));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Returns the signed offset (in minutes) of `timezone` from UTC at the given
 * instant. Positive means the zone is ahead of UTC (e.g. +120 for UTC+2).
 * Uses Intl.DateTimeFormat — the same dependency-free pattern used elsewhere
 * in the frontend (see weatherDayGroups.ts). Falls back to 0 on an invalid
 * timezone identifier.
 */
export function timezoneOffsetMinutes(timezone: string, instant: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(instant);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (!tzPart) return 0;
    // tzPart.value looks like "GMT+2", "GMT-5", "GMT", or "GMT+5:30".
    const raw = tzPart.value.replace(/^GMT/i, '');
    if (!raw || raw === 'Z' || raw === '+0' || raw === '-0') return 0;
    const sign = raw.startsWith('-') ? -1 : 1;
    const body = raw.replace(/^[+-]/, '');
    const [h, m] = body.split(':').map(Number);
    return sign * ((h || 0) * 60 + (m || 0));
  } catch {
    return 0;
  }
}

/**
 * Build the instant at which a given city-local wall-clock minute on a given
 * calendar date ends. Returns null if the inputs are malformed.
 *
 * For example, with dateKey "2026-08-04", endMinutes 60 (01:00) and timezone
 * "Europe/Prague", this returns the instant corresponding to 2026-08-04 01:00
 * in Prague (which is 2026-08-03 23:00 UTC during CEST).
 */
export function localDayMinuteToInstant(
  dateKey: string,
  minutes: number,
  timezone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (!year || !month || !day) return null;

  const dayOffset = Math.floor(minutes / MINUTES_IN_DAY);
  const minuteOfDay = minutes % MINUTES_IN_DAY;
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;

  // Construct the wall-clock instant as if it were UTC, then correct for the
  // target timezone's offset (and DST) measured at that rough instant.
  const asIfUtc = Date.UTC(year, month - 1, day + dayOffset, hour, minute, 0, 0);
  const probe = new Date(asIfUtc);
  const offset = timezoneOffsetMinutes(timezone, probe);
  // A zone at UTC+2 means wall-clock 01:00 there equals 23:00 UTC the day
  // before, so we subtract the offset from the as-if-UTC value.
  return new Date(asIfUtc - offset * 60_000);
}

export type WindowReachabilityInput = {
  dayOffsets: number[];
  timeOfDays: PlayIntentTimeOfDay[];
  customRange?: [string, string] | readonly [string, string];
  /** yyyy-MM-dd for the viewer's "today" in the city timezone. */
  todayKey?: string;
  timezone?: string;
  now?: Date;
};

/**
 * True when every selected day's play window has already ended — i.e. there
 * is no selected day whose window end is still in the future. Mirrors the
 * backend's intentWindowEndsAt + "expiresAt <= now" check in
 * playIntent.service.ts, so the client can refuse to submit a request that
 * the server would reject with 400 playIntent.windowEnded.
 *
 * Defensive defaults:
 * - Missing timezone/todayKey → cannot evaluate → returns false (let the
 *   server be the source of truth rather than over-blocking).
 * - ANYTIME never counts as past (its end is end-of-day, and a future day is
 *   always reachable).
 */
export function playWindowIsInPast(input: WindowReachabilityInput): boolean {
  const { dayOffsets, timeOfDays, customRange, todayKey, timezone } = input;
  const now = input.now ?? new Date();
  if (!todayKey || !timezone) return false;
  if (!dayOffsets.length || !timeOfDays.length) return false;

  const endMinutes = resolveTimeWindowEndMinutes(
    timeOfDays,
    customRange?.[1],
  );

  for (const offset of dayOffsets) {
    const dateKey = shiftDateKey(todayKey, offset);
    const endInstant = localDayMinuteToInstant(dateKey, endMinutes, timezone);
    if (!endInstant) continue;
    if (endInstant.getTime() > now.getTime()) {
      // At least one selected day still has a reachable window.
      return false;
    }
  }
  return true;
}
