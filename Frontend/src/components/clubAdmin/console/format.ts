/**
 * Console formatters. Every club datum is formatted in the **club** time zone with the active app
 * locale (`sr` → Serbian Latin via `resolveIntlLocale`) and the user's 12/24 h preference.
 * Formatters are built once per (locale, zone, hour12) and reused — never construct `Intl` per cell.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { minutesToTime } from '@shared/clubAdmin/clubTime';
import { resolveAppLocale, resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveIntlLocale } from '@/utils/intlLocale';
import { formatIntlPercent } from '@/utils/intlPercent';
import { CURRENCY_INFO, formatPrice } from '@/utils/currency';
import { useAuthStore } from '@/store/authStore';
import type { PriceCurrency } from '@/types';

export interface ConsoleFormatOptions {
  locale: string;
  timeZone: string;
  hour12: boolean;
}

export interface ConsoleFormat {
  locale: string;
  timeZone: string;
  hour12: boolean;
  /** Instant → club wall time (`18:00` / `6:00 PM`). */
  time: (iso: string | Date) => string;
  timeRange: (startIso: string, endIso: string) => string;
  /** Minutes from club midnight (may exceed 1440) → wall-clock label. */
  wallTime: (minutes: number) => string;
  /** `yyyy-MM-dd` → "Tuesday, 6 October". */
  dateLong: (date: string) => string;
  /** `yyyy-MM-dd` → "Tue, 6 Oct". */
  dateMedium: (date: string) => string;
  /** `yyyy-MM-dd` → "Tue". */
  weekdayShort: (date: string) => string;
  /** `yyyy-MM-dd` → "6". */
  dayOfMonth: (date: string) => string;
  /** Instant → "Tue, 6 Oct, 18:00" in the club zone. */
  dateTime: (iso: string) => string;
  number: (n: number) => string;
  percent: (n: number) => string;
  money: (cents: number, currency: string) => string;
}

function dateFromClubDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12));
}

function safeFormatter(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, opts);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: opts.timeZone === undefined ? undefined : 'UTC' });
  }
}

export function createConsoleFormat({ locale: rawLocale, timeZone, hour12 }: ConsoleFormatOptions): ConsoleFormat {
  const locale = resolveIntlLocale(rawLocale);
  const timeOpts: Intl.DateTimeFormatOptions = { hour: hour12 ? 'numeric' : '2-digit', minute: '2-digit', hour12 };
  const clubTime = safeFormatter(locale, { ...timeOpts, timeZone });
  const utcTime = safeFormatter(locale, { ...timeOpts, timeZone: 'UTC' });
  const dateLong = safeFormatter(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const dateMedium = safeFormatter(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekday = safeFormatter(locale, { weekday: 'short', timeZone: 'UTC' });
  const day = safeFormatter(locale, { day: 'numeric', timeZone: 'UTC' });
  const dateTime = safeFormatter(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...timeOpts,
    timeZone,
  });
  const numberFmt = new Intl.NumberFormat(locale);

  return {
    locale,
    timeZone,
    hour12,
    time: (iso) => clubTime.format(typeof iso === 'string' ? new Date(iso) : iso),
    timeRange: (s, e) => `${clubTime.format(new Date(s))}–${clubTime.format(new Date(e))}`,
    wallTime: (minutes) => {
      const m = ((minutes % 1440) + 1440) % 1440;
      try {
        return utcTime.format(new Date(Date.UTC(2000, 0, 1, 0, m)));
      } catch {
        return minutesToTime(m);
      }
    },
    dateLong: (d) => dateLong.format(dateFromClubDate(d)),
    dateMedium: (d) => dateMedium.format(dateFromClubDate(d)),
    weekdayShort: (d) => weekday.format(dateFromClubDate(d)),
    dayOfMonth: (d) => day.format(dateFromClubDate(d)),
    dateTime: (iso) => dateTime.format(new Date(iso)),
    number: (n) => numberFmt.format(n),
    percent: (n) => formatIntlPercent(n, locale),
    money: (cents, currency) => {
      if (currency in CURRENCY_INFO) return formatPrice(cents, currency as PriceCurrency);
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
      } catch {
        return `${(cents / 100).toFixed(2)} ${currency}`;
      }
    },
  };
}

export function useConsoleFormat(timeZone: string): ConsoleFormat {
  const { i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hour12 = resolveDisplaySettings(user).hour12;
  const locale = resolveAppLocale(i18n.language);
  return useMemo(() => createConsoleFormat({ locale, timeZone, hour12 }), [locale, timeZone, hour12]);
}
