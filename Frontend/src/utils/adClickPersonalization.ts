/** Keep in sync with Backend/src/services/ads/ad.clickUrl.util.ts locale/theme resolution. */

export const AD_CLICK_SUPPORTED_LOCALES = ['en', 'ru', 'sr', 'es', 'cs'] as const;
export type AdClickSupportedLocale = (typeof AD_CLICK_SUPPORTED_LOCALES)[number];

const AD_CLICK_LOCALE_ALIASES: Record<string, AdClickSupportedLocale> = {
  rs: 'sr',
  srb: 'sr',
  ser: 'sr',
  eng: 'en',
  rus: 'ru',
  esp: 'es',
  spa: 'es',
  cze: 'cs',
  ces: 'cs',
};

function primaryLanguageTag(raw: string): string {
  return raw.trim().toLowerCase().split(/[-_]/)[0] || '';
}

export function normalizeAdClickLocale(locale: string | null | undefined): AdClickSupportedLocale | null {
  if (!locale?.trim()) return null;
  const lower = locale.trim().toLowerCase();
  if (lower === 'auto' || lower === 'system') return null;
  const primary = primaryLanguageTag(lower);
  if (!primary) return null;
  const aliased = AD_CLICK_LOCALE_ALIASES[primary] ?? primary;
  if ((AD_CLICK_SUPPORTED_LOCALES as readonly string[]).includes(aliased)) {
    return aliased as AdClickSupportedLocale;
  }
  return null;
}

export function resolveAdClickLocale(
  ...candidates: Array<string | null | undefined>
): AdClickSupportedLocale {
  for (const candidate of candidates) {
    const hit = normalizeAdClickLocale(candidate);
    if (hit) return hit;
  }
  return 'en';
}

export function resolveAdClickTheme(
  theme: string | null | undefined,
  opts?: { systemIsDark?: boolean },
): 'light' | 'dark' {
  const value = theme?.trim().toLowerCase();
  if (value === 'light' || value === 'dark') return value;
  if (value === 'system' || value === 'auto') {
    if (typeof opts?.systemIsDark === 'boolean') {
      return opts.systemIsDark ? 'dark' : 'light';
    }
  }
  return 'light';
}
