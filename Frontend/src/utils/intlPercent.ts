/**
 * One percentage formatter for the whole app.
 *
 * A hard-coded `%` in a translated string is wrong in more locales than it is
 * right: the symbol's position and the space before it differ (`70 %` in `cs`,
 * `٧٠٪` in `ar` with its own numerals and bidi isolation), and leaving the
 * choice to eleven translators produced eleven different answers. Pass a whole
 * number 0–100; the locale decides everything else.
 */
import { resolveIntlLocale } from './intlLocale';

export function formatIntlPercent(value: number, locale: string | null | undefined): string {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  try {
    return new Intl.NumberFormat(resolveIntlLocale(locale), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(clamped / 100);
  } catch {
    return `${clamped}%`;
  }
}
