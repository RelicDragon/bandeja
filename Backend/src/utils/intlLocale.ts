/**
 * Turning a stored `User.language` into something `Intl` will accept.
 *
 * `User.language` defaults to **`"auto"`** — "follow the device" — which is not
 * a BCP-47 tag. Handing it straight to `Intl.DateTimeFormat` throws
 * `RangeError: Incorrect locale information provided`, and because notification
 * builders run inside a `.catch()` the throw is swallowed: the push is simply
 * never sent, for every user who never picked a language. That is the default
 * for most accounts, so an unguarded `Intl` call here silently disables a
 * feature rather than mis-formatting a date.
 *
 * `sr` is Serbian **Latin** in this product (CONTRACT §8.1); the bare `sr` tag
 * resolves to Cyrillic, so it is mapped explicitly.
 */

/** Values that mean "no explicit choice" rather than a language. */
const UNSET_LANGUAGE_VALUES = new Set(['', 'auto', 'system', 'default']);

export const DEFAULT_INTL_LOCALE = 'en';

/**
 * A locale tag `Intl` is guaranteed to accept, falling back to `en`.
 *
 * Never throws: an unknown-but-well-formed tag (`xx-YY`) is handed through and
 * `Intl` resolves it the usual way, while anything malformed becomes `en`.
 */
export function resolveIntlLocale(language: string | null | undefined): string {
  const raw = (language ?? '').trim();
  if (!raw || UNSET_LANGUAGE_VALUES.has(raw.toLowerCase())) return DEFAULT_INTL_LOCALE;

  const normalized = raw.toLowerCase() === 'sr' ? 'sr-Latn' : raw;
  try {
    // The cheapest way to ask V8 whether it will accept the tag.
    new Intl.Locale(normalized);
    return normalized;
  } catch {
    return DEFAULT_INTL_LOCALE;
  }
}
