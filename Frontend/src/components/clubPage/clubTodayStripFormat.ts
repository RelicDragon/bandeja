/**
 * PRD 354 — "Updated 2 min ago" for the today-at-a-glance strip.
 */
import { resolveIntlLocale } from '@/utils/intlLocale';

/**
 * `null` when there is no usable timestamp, `''` for "just now" (the caller
 * picks a different string), otherwise a localised relative phrase.
 * Returns data, not copy, so the component keeps ownership of `t`.
 */
export function relativeUpdatedPhrase(
  updatedAt: string | null,
  locale: string,
  now: number = Date.now(),
): string | null {
  if (!updatedAt) return null;
  const then = Date.parse(updatedAt);
  if (!Number.isFinite(then)) return null;
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return '';
  // A bare `sr` makes `Intl` answer in Cyrillic ("пре 5 минута") inside a
  // Serbian-Latin UI; `resolveIntlLocale` adds the script tag.
  const rtf = new Intl.RelativeTimeFormat(resolveIntlLocale(locale), { numeric: 'auto' });
  return minutes < 60
    ? rtf.format(-minutes, 'minute')
    : rtf.format(-Math.round(minutes / 60), 'hour');
}

/**
 * The opening-window hint's clock times.
 *
 * `openHour` / `closeHour` arrive as plain integers, so the clock *shape* is
 * the app's decision, not eleven translators': every locale string now carries
 * bare `{{open}}` / `{{close}}` placeholders and the hour is rendered here
 * through `Intl` with the viewer's own 12/24-hour preference. Hard-coding
 * `{{open}}:00` in the copy showed an `en-US` viewer a 24-hour clock the app
 * never uses anywhere else, and put unisolated Western digits next to a colon
 * in Arabic.
 */
export function formatOpeningHour(hour: number, locale: string, hour12: boolean): string {
  const clamped = Math.min(24, Math.max(0, Math.trunc(hour)));
  // A fixed UTC day so only the hour matters; `24` rolls over to midnight.
  const at = new Date(Date.UTC(2024, 0, 1, clamped));
  try {
    return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
      // A 24-hour clock is conventionally zero-padded ("00:00"), a 12-hour one
      // is not ("7:00 AM").
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hour12,
      timeZone: 'UTC',
    }).format(at);
  } catch {
    return `${String(clamped % 24).padStart(2, '0')}:00`;
  }
}
