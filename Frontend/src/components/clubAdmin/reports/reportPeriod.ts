/**
 * Report period math, on club-local `yyyy-MM-dd` dates (never device dates). A period is inclusive
 * on both ends and at most `CLUB_REPORT_MAX_DAYS` long; "previous" is the same number of days
 * immediately before (what the server returns for `compare=1`).
 */
import { CLUB_REPORT_MAX_DAYS } from '@shared/clubAdmin/contract';
import { addDaysToDate, daysBetweenInclusive, isClubDate } from '@shared/clubAdmin/clubTime';

export const REPORT_PRESETS = ['7', '30', '90'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export type ReportPeriodMode = ReportPreset | 'custom';

export interface ReportRange {
  from: string;
  to: string;
}

/** Last `days` days ending today (today included). */
export function presetRange(preset: ReportPreset, today: string): ReportRange {
  return { from: addDaysToDate(today, -(Number(preset) - 1)), to: today };
}

/**
 * Normalises a custom range: swaps reversed ends, then trims the **start** so the period is at
 * most `maxDays` long (the end the operator picked is kept). Invalid dates → `null`.
 */
export function clampRange(from: string, to: string, maxDays = CLUB_REPORT_MAX_DAYS): ReportRange | null {
  if (!isClubDate(from) || !isClubDate(to)) return null;
  let a = from;
  let b = to;
  if (a > b) [a, b] = [b, a];
  if (daysBetweenInclusive(a, b) > maxDays) a = addDaysToDate(b, -(maxDays - 1));
  return { from: a, to: b };
}

export function previousRange(range: ReportRange): ReportRange {
  const days = daysBetweenInclusive(range.from, range.to);
  return { from: addDaysToDate(range.from, -days), to: addDaysToDate(range.from, -1) };
}

export interface ResolvedPeriod extends ReportRange {
  mode: ReportPeriodMode;
  compare: boolean;
}

/** URL `?period=7|30|90|custom&from&to&compare=1` → a valid period (defaults: last 30 days). */
export function resolvePeriod(params: URLSearchParams, today: string): ResolvedPeriod {
  const compare = params.get('compare') === '1';
  const mode = params.get('period');
  if (mode === 'custom') {
    const r = clampRange(params.get('from') ?? '', params.get('to') ?? '');
    if (r) return { ...r, mode: 'custom', compare };
  }
  const preset: ReportPreset = (REPORT_PRESETS as readonly string[]).includes(mode ?? '') ? (mode as ReportPreset) : '30';
  return { ...presetRange(preset, today), mode: preset, compare };
}

export interface MetricDelta {
  /** current − previous */
  diff: number;
  /** Relative change in percent; `null` when the previous value is 0 (no meaningful ratio). */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export function metricDelta(current: number | null | undefined, previous: number | null | undefined): MetricDelta | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const diff = current - previous;
  const pct = previous === 0 ? null : (diff / Math.abs(previous)) * 100;
  const direction = Math.abs(diff) < 1e-9 ? 'flat' : diff > 0 ? 'up' : 'down';
  return { diff, pct, direction };
}

/** Weeks in the period, for choosing a daily vs weekly axis density. */
export function tickEvery(days: number): number {
  if (days <= 14) return 1;
  if (days <= 45) return 7;
  if (days <= 120) return 14;
  return 30;
}
