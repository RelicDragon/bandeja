import type { SeriesCadence } from '@/api/series';
import { resolveIntlLocale } from '@/utils/intlLocale';

/**
 * PRD 345 — every weekday and date string the series UI shows.
 *
 * Nothing here hard-codes a weekday name or a date order: both come from
 * `Intl` with the user's active locale, and the first day of the week comes
 * from `Intl.Locale.weekInfo` where the runtime supports it (Monday otherwise,
 * which is what the rest of the app assumes). Pure and side-effect free so it
 * can be unit-tested without a DOM.
 */

/** 1 = Monday … 7 = Sunday (ISO-8601), matching `GameSeries.weekday`. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** 2024-01-01 was a Monday, so `referenceDateForWeekday(1)` is that Monday. */
function referenceDateForWeekday(weekday: number): Date {
  const clamped = Math.min(7, Math.max(1, Math.trunc(weekday)));
  return new Date(Date.UTC(2024, 0, clamped));
}

export function formatWeekdayName(
  weekday: number,
  locale: string,
  style: 'long' | 'short' = 'long',
): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    weekday: style,
    timeZone: 'UTC',
  }).format(referenceDateForWeekday(weekday));
}

/**
 * `sr` in this app is Serbian **Latin**; `Intl` needs the script tag to agree.
 *
 * Kept as a named re-export because this module's own helpers and tests use it,
 * but the implementation now lives in `@/utils/intlLocale` so every module that
 * builds an `Intl` formatter shares one answer.
 */
export const resolveLocale = resolveIntlLocale;

/**
 * First weekday of the week for this locale, as an ISO weekday.
 * Falls back to Monday when the runtime has no `weekInfo` (older Safari).
 */
export function firstWeekdayForLocale(locale: string): IsoWeekday {
  try {
    const resolved = new Intl.Locale(resolveLocale(locale)) as Intl.Locale & {
      weekInfo?: { firstDay?: number };
      getWeekInfo?: () => { firstDay?: number };
    };
    const info = resolved.getWeekInfo?.() ?? resolved.weekInfo;
    const firstDay = info?.firstDay;
    if (typeof firstDay === 'number' && firstDay >= 1 && firstDay <= 7) {
      return firstDay as IsoWeekday;
    }
  } catch {
    // Unsupported locale string or no weekInfo — Monday it is.
  }
  return 1;
}

/** `ISO_WEEKDAYS` rotated so the locale's first day comes first. */
export function weekdayOrderForLocale(locale: string): IsoWeekday[] {
  const first = firstWeekdayForLocale(locale);
  const offset = first - 1;
  return ISO_WEEKDAYS.map((_, index) => (((index + offset) % 7) + 1) as IsoWeekday);
}

export function cadenceLabelKey(cadence: SeriesCadence): string {
  return cadence === 'BIWEEKLY' ? 'series.cadenceBiweekly' : 'series.cadenceWeekly';
}

export function cadencePillKey(cadence: SeriesCadence): string {
  return cadence === 'BIWEEKLY' ? 'series.pillBiweekly' : 'series.pillWeekly';
}

export function repeatSummaryKey(cadence: SeriesCadence): string {
  return cadence === 'BIWEEKLY'
    ? 'series.repeatSummaryBiweekly'
    : 'series.repeatSummaryWeekly';
}

export interface DateFormatOptions {
  locale: string;
  timeZone?: string | null;
}

/** "Tue 1 Oct" — short weekday, day, short month. */
export function formatShortDate(
  value: string | Date,
  { locale, timeZone }: DateFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** "Tue 1 Oct, 19:00" — the card headline for the next occurrence. */
export function formatShortDateTime(
  value: string | Date,
  { locale, timeZone }: DateFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** "30 Nov" — the "Ended on" ribbon and the Until chip. */
export function formatDayMonth(
  value: string | Date,
  { locale, timeZone }: DateFormatOptions,
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    day: 'numeric',
    month: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Render a club-local `HH:mm` in the user's locale (12h vs 24h is the locale's
 * business, not ours). The reference date is arbitrary and never shown.
 */
export function formatLocalTime(startTimeLocal: string, locale: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTimeLocal);
  if (!match) return startTimeLocal;
  const date = new Date(Date.UTC(2024, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

/** A `YYYY-MM-DD` day key rendered as a date, without timezone drift. */
export function formatDayKey(
  dayKey: string,
  locale: string,
  style: 'short' | 'dayMonth' = 'short',
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey;
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  return style === 'dayMonth'
    ? formatDayMonth(date, { locale, timeZone: 'UTC' })
    : formatShortDate(date, { locale, timeZone: 'UTC' });
}

/** `YYYY-MM-DD` for an instant in a given timezone (club-local calendar day). */
export function dayKeyInTimeZone(value: string | Date, timeZone?: string | null): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return year && month && day ? `${year}-${month}-${day}` : '';
}

/** `HH:mm` of an instant in a given timezone — seeds the Repeat sheet. */
export function localTimeInTimeZone(value: string | Date, timeZone?: string | null): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** ISO weekday of an instant in a timezone. */
export function isoWeekdayInTimeZone(
  value: string | Date,
  timeZone?: string | null,
): IsoWeekday {
  const dayKey = dayKeyInTimeZone(value, timeZone);
  if (!dayKey) return 1;
  const utcDay = new Date(`${dayKey}T00:00:00.000Z`).getUTCDay();
  return (utcDay === 0 ? 7 : utcDay) as IsoWeekday;
}
