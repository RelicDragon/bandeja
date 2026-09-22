/**
 * PRD 359 — "In queue · 2nd" on a game card.
 *
 * Only a few of the eleven locales build an ordinal by appending something to
 * the cardinal, and `Intl` has no `formatToOrdinal`: `Intl.PluralRules` with
 * `{ type: 'ordinal' }` tells you *which* suffix applies, never what it is. So
 * the suffixes live in the table below and the rest of the locales — ru, sr,
 * zh, ja, th, ar, hi, id, whose ordinals inflect for gender and case or are
 * built with a prefix — carry the whole written form in their resource file
 * (`games.queuePositionOrdinal`) and get `null` from {@link formatOrdinal}.
 *
 * Deliberately not a "-th for everyone" fallback: "2th" in English is worse
 * than a locale-appropriate "No. 2".
 */

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

const ORDINAL_SUFFIXES: Record<string, Partial<Record<PluralCategory, string>>> = {
  /** 1st, 2nd, 3rd, 4th … 11th, 21st. `Intl` knows the teens exception. */
  en: { one: 'st', two: 'nd', few: 'rd', other: 'th' },
  /** Spanish writes the masculine ordinal indicator: 1.º, 2.º, 3.º. */
  es: { other: '.º' },
  /** Czech writes ordinals with a full stop: 1., 2., 3. */
  cs: { other: '.' },
};

/** `en-GB` → `en`; an empty or unknown tag returns `''`. */
export function ordinalBaseLocale(locale: string | undefined | null): string {
  return (locale ?? '').split('-')[0].toLowerCase();
}

/** True when {@link formatOrdinal} can build the form without a resource string. */
export function hasOrdinalSuffixes(locale: string | undefined | null): boolean {
  return ordinalBaseLocale(locale) in ORDINAL_SUFFIXES;
}

/** The position as digits in the locale's numbering system ("2", "٢"). */
export function formatLocaleNumber(value: number, locale: string | undefined | null): string {
  const n = Math.trunc(value);
  const base = ordinalBaseLocale(locale);
  try {
    return new Intl.NumberFormat(base || undefined).format(n);
  } catch {
    return String(n);
  }
}

/**
 * `2` → `"2nd"` in English, `"2.º"` in Spanish, `"2."` in Czech.
 * `null` for every locale that needs its own written form.
 */
export function formatOrdinal(value: number, locale: string | undefined | null): string | null {
  if (!Number.isFinite(value)) return null;
  const table = ORDINAL_SUFFIXES[ordinalBaseLocale(locale)];
  if (!table) return null;
  const n = Math.trunc(value);
  const base = ordinalBaseLocale(locale);
  let category: PluralCategory = 'other';
  try {
    category = new Intl.PluralRules(base, { type: 'ordinal' }).select(n) as PluralCategory;
  } catch {
    category = 'other';
  }
  return `${formatLocaleNumber(n, locale)}${table[category] ?? table.other ?? ''}`;
}

/**
 * The ordinal a component should render. `fallback` is called with the
 * locale-formatted digits only when the locale has no derivable suffix, so the
 * caller supplies exactly one translated string and never a hard-coded one.
 */
export function ordinalLabel(
  value: number,
  locale: string | undefined | null,
  fallback: (position: string) => string,
): string {
  return formatOrdinal(value, locale) ?? fallback(formatLocaleNumber(value, locale));
}
