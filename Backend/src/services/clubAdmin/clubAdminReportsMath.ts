/**
 * Club report math (pure): periods, per-court interval unions and their overlap with opening
 * windows, club-local hour buckets for the heatmap, Monday weeks. docs/domains/club-admin.md
 * "Reports".
 */
import { CLUB_REPORT_MAX_DAYS, type ClubReportPeriod } from '@bandeja/shared/clubAdmin/contract';
import { addDaysToDate, daysBetweenInclusive, isClubDate, isoWeekdayOfDate } from '@bandeja/shared/clubAdmin/clubTime';
import { clubAdminError, clubAdminValidation } from './clubAdminErrors';
import type { CourtInterval } from './clubAdminOccupancy';
import { wallInstantMs } from './clubAdminQuote';

/** Validates `from`/`to` (club-local, inclusive) and returns the period. */
export function parseReportPeriod(from: unknown, to: unknown): ClubReportPeriod {
  if (!isClubDate(from)) throw clubAdminValidation('from', 'must be yyyy-MM-dd');
  if (!isClubDate(to)) throw clubAdminValidation('to', 'must be yyyy-MM-dd');
  if (to < from) throw clubAdminValidation('to', 'must not be before from');
  const days = daysBetweenInclusive(from, to);
  if (days > CLUB_REPORT_MAX_DAYS) {
    throw clubAdminError(400, 'clubAdmin.rangeTooLarge', `Reports cover at most ${CLUB_REPORT_MAX_DAYS} days`);
  }
  return { from, to, days };
}

/** The period of the same length immediately before. */
export function previousPeriod(p: ClubReportPeriod): ClubReportPeriod {
  return { from: addDaysToDate(p.from, -p.days), to: addDaysToDate(p.from, -1), days: p.days };
}

export function periodDates(p: Pick<ClubReportPeriod, 'from' | 'to'>): string[] {
  const out: string[] = [];
  for (let d = p.from; d <= p.to; d = addDaysToDate(d, 1)) out.push(d);
  return out;
}

export type MergedIntervals = Map<string, Array<[number, number]>>;

/** Per court: sorted, non-overlapping unions (ms). Overlapping bookings on one court count once. */
export function mergeIntervalsByCourt(intervals: readonly CourtInterval[], courtIds: ReadonlySet<string>): MergedIntervals {
  const byCourt = new Map<string, Array<[number, number]>>();
  for (const iv of intervals) {
    if (!courtIds.has(iv.courtId)) continue;
    const s = iv.start.getTime();
    const e = iv.end.getTime();
    if (e <= s) continue;
    const list = byCourt.get(iv.courtId) ?? [];
    list.push([s, e]);
    byCourt.set(iv.courtId, list);
  }
  const out: MergedIntervals = new Map();
  for (const [courtId, list] of byCourt) {
    list.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of list) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    out.set(courtId, merged);
  }
  return out;
}

/** Milliseconds of `merged` inside `[ws, we)` (binary search to the first candidate). */
export function overlapMs(merged: ReadonlyArray<[number, number]> | undefined, ws: number, we: number): number {
  if (!merged || merged.length === 0 || we <= ws) return 0;
  let lo = 0;
  let hi = merged.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (merged[mid][1] <= ws) lo = mid + 1;
    else hi = mid;
  }
  let total = 0;
  for (let i = lo; i < merged.length && merged[i][0] < we; i++) {
    total += Math.max(0, Math.min(merged[i][1], we) - Math.max(merged[i][0], ws));
  }
  return total;
}

export interface HourBucket {
  /** 0 = Monday ... 6 = Sunday (club-local). */
  weekday: number;
  hour: number;
  start: number;
  end: number;
}

/**
 * Splits an opening window that starts on club-local `date` into club-local clock hours. Hours
 * past midnight belong to the next day's weekday. DST: a skipped hour has no bucket, a repeated
 * hour is one 2-hour bucket.
 */
export function hourBuckets(date: string, window: { start: Date; end: Date }, timezone: string): HourBucket[] {
  const ws = window.start.getTime();
  const we = window.end.getTime();
  const out: HourBucket[] = [];
  const firstWeekday = isoWeekdayOfDate(date) - 1;
  // Wall hours 0..48 of `date` cover any window that starts on it (≤ 24 h long).
  const instants: number[] = [];
  for (let k = 0; k <= 48; k++) instants.push(wallInstantMs(date, k * 60, timezone));
  for (let k = 0; k < 48; k++) {
    const s = Math.max(instants[k], ws);
    const e = Math.min(instants[k + 1], we);
    if (e <= s) continue;
    out.push({ weekday: (firstWeekday + Math.floor(k / 24)) % 7, hour: k % 24, start: s, end: e });
  }
  return out;
}

/** Mondays of every week touching [from, to]. */
export function mondayWeeks(from: string, to: string): string[] {
  let monday = addDaysToDate(from, -(isoWeekdayOfDate(from) - 1));
  const out: string[] = [];
  while (monday <= to) {
    out.push(monday);
    monday = addDaysToDate(monday, 7);
  }
  return out;
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 1000) / 10);
}
