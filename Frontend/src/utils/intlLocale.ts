/**
 * The single place that turns an i18next language code into a tag `Intl` can be
 * trusted with.
 *
 * `i18n.language` is the bare two-letter code (`Frontend/src/i18n/config.ts`),
 * and for one of the eleven that is not enough: **`sr` in this app is Serbian
 * Latin** (CONTRACT §8.1), while `Intl` reads a bare `sr` as Cyrillic. Hand
 * `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat` the raw code and a user
 * whose entire UI is Latin gets `септембар` and `пре 5 минута`.
 *
 * Numbers, percentages and currency are script-neutral, so the blast radius is
 * month names, weekday names and relative time — but routing every `Intl`
 * construction through here costs nothing and means the next module cannot get
 * it wrong.
 */

/** Matches an ISO 15924 script subtag (`Latn`, `Cyrl`, …). */
function isScriptSubtag(part: string): boolean {
  return /^[A-Za-z]{4}$/.test(part);
}

export function resolveIntlLocale(locale: string | null | undefined): string {
  const tag = locale?.trim();
  if (!tag) return 'en';
  const parts = tag.split('-');
  if (parts[0].toLowerCase() !== 'sr') return tag;
  // An explicit script wins — `sr-Cyrl` means Cyrillic and we must not override it.
  if (parts.slice(1).some(isScriptSubtag)) return tag;
  return ['sr', 'Latn', ...parts.slice(1)].join('-');
}
