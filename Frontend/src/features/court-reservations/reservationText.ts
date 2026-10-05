/** Pure text helpers for the owned `courtReservation` namespace (no React, no stores). */
import type { TFunction } from 'i18next';
import type { ReservationCopy } from '@shared/gameBooking/reservationCopy';
import { splitMinutes, type ClubTimeFormatter } from './clubTime';

export const COURT_RESERVATION_NS = 'courtReservation';

/** Shared flat-style key (namespace + dot + path) → the key inside the owned namespace. */
export function toNamespaceKey(i18nKey: string): string {
  const dot = i18nKey.indexOf('.');
  return i18nKey.slice(0, dot) === COURT_RESERVATION_NS ? i18nKey.slice(dot + 1) : i18nKey;
}

export function translateReservationCopy(t: TFunction, copy: ReservationCopy, clock: ClubTimeFormatter): string {
  const params: Record<string, string | number> = { ...copy.params };
  for (const name of copy.timeParams) {
    const value = params[name];
    if (typeof value === 'string') params[name] = clock.time(value);
  }
  return t(toNamespaceKey(copy.i18nKey), params);
}

export function formatDuration(t: TFunction, minutes: number): string {
  const { h, m } = splitMinutes(minutes);
  if (h > 0 && m > 0) return t('duration.hm', { h, m });
  if (h > 0) return t('duration.h', { h });
  return t('duration.m', { m });
}

type DurationFormatCtor = new (
  locale: string | undefined,
  options: { style: 'narrow' | 'short' | 'long' },
) => { format(duration: { hours?: number; minutes?: number }): string };

/**
 * `90` → "1h 30m" (Intl.DurationFormat, narrow) — short enough never to wrap
 * in a stepper. Falls back to the `duration.short*` keys where the runtime
 * has no DurationFormat (older WebViews).
 */
export function formatCompactDuration(t: TFunction, minutes: number, locale?: string): string {
  const { h, m } = splitMinutes(minutes);
  const Ctor = (Intl as unknown as { DurationFormat?: DurationFormatCtor }).DurationFormat;
  if (Ctor) {
    try {
      return new Ctor(locale, { style: 'narrow' }).format(h > 0 && m > 0 ? { hours: h, minutes: m } : h > 0 ? { hours: h } : { minutes: m });
    } catch {
      // fall through to the keys
    }
  }
  if (h > 0 && m > 0) return t('duration.shortHm', { h, m });
  if (h > 0) return t('duration.shortH', { h });
  return t('duration.shortM', { m });
}

/** "A, B or C" / "A, B and C" in the UI language. */
export function formatList(items: readonly string[], locale?: string, type: 'conjunction' | 'disjunction' = 'conjunction'): string {
  const ListFormat = (Intl as unknown as { ListFormat?: new (l?: string, o?: { type: string }) => { format(i: readonly string[]): string } })
    .ListFormat;
  if (ListFormat) {
    try {
      return new ListFormat(locale, { type }).format(items);
    } catch {
      // fall through
    }
  }
  return items.join(', ');
}
