/**
 * PRD 353 — month arithmetic for the monthly recap.
 *
 * Everything here is pure and UTC-based on purpose. The recap is a *calendar*
 * artefact: "September" has to mean the same 30 days for a scheduler tick, a
 * payload builder and a retention sweep, whatever the server timezone is. The
 * client re-labels the month with `Intl` in the viewer's locale, so no user ever
 * sees the UTC boundary.
 */

/** `MonthlyRecap` rows are kept for 12 months (PRD 353, retention). */
export const RECAP_RETENTION_MONTHS = 12;

/** Days of the month the scheduler is allowed to generate on (cron `0 4 1-3 * *`). */
export const RECAP_GENERATION_DAYS = [1, 2, 3] as const;

/** A user with no game last month still gets the low-activity recap if they played in this window. */
export const RECAP_LOW_ACTIVITY_LOOKBACK_DAYS = 90;

/** At or below this many games the recap switches to the three-slide "come back" variant. */
export const RECAP_LOW_ACTIVITY_MAX_GAMES = 1;

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY_RE.test(value);
}

export function monthKeyOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** `2026-09` → `{ start: 2026-09-01T00:00Z, end: 2026-10-01T00:00Z }` (end exclusive). */
export function monthKeyRange(monthKey: string): { start: Date; end: Date } {
  if (!isMonthKey(monthKey)) {
    throw new Error(`Invalid monthKey: ${monthKey}`);
  }
  const [year, month] = monthKey.split('-').map((part) => Number(part));
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/** The month that had just ended when `now` happened. */
export function previousMonthKey(now: Date): string {
  return monthKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
}

/** Shifts a month key by whole months; negative goes back. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const { start } = monthKeyRange(monthKey);
  return monthKeyOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1)));
}

export function daysInMonthKey(monthKey: string): number {
  const { start, end } = monthKeyRange(monthKey);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** Monday-based weekday index (0 = Monday … 6 = Sunday) of the 1st of the month. */
export function monthWeekdayOffset(monthKey: string): number {
  const { start } = monthKeyRange(monthKey);
  return (start.getUTCDay() + 6) % 7;
}

/**
 * The scheduler fires daily on the 1st–3rd so a node that was down on the 1st
 * still catches up. Anything outside that window is a manual/no-op tick.
 */
export function isRecapGenerationDay(now: Date): boolean {
  return (RECAP_GENERATION_DAYS as readonly number[]).includes(now.getUTCDate());
}

/** Cutoff before which `MonthlyRecap` rows are pruned. */
export function recapRetentionCutoff(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RECAP_RETENTION_MONTHS, 1));
}

/** Oldest month key still kept by the 12-month retention rule. */
export function oldestRetainedMonthKey(now: Date): string {
  return monthKeyOf(recapRetentionCutoff(now));
}

export function recapLowActivityLookbackStart(monthStart: Date): Date {
  return new Date(monthStart.getTime() - RECAP_LOW_ACTIVITY_LOOKBACK_DAYS * 86_400_000);
}

/** 1-based day-of-month of a timestamp, in the same UTC frame as the month window. */
export function dayOfMonthUtc(date: Date): number {
  return date.getUTCDate();
}
