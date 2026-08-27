import { AD_CLICK_URL_AD_TOKEN_PARAM } from './ad.token.util';

export { AD_CLICK_URL_AD_TOKEN_PARAM } from './ad.token.util';

export const AD_CLICK_URL_USER_NAME_PARAM = 'user_name';
export const AD_CLICK_URL_LOCALE_PARAM = 'locale';
export const AD_CLICK_URL_THEME_PARAM = 'theme';
export const AD_CLICK_URL_USER_NAME_MAX_LEN = 80;

export const AD_CLICK_SUPPORTED_LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar'] as const;
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

export type AdClickUrlPersonalizationFlags = {
  appendUserNameToClickUrl: boolean;
  appendLocaleToClickUrl: boolean;
  appendThemeToClickUrl: boolean;
  appendAdTokenToClickUrl: boolean;
};

export type AdClickUrlPersonalizationValues = {
  userName?: string | null;
  locale?: string | null;
  theme?: string | null;
  adToken?: string | null;
};

export function resolveAdClickUserName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  if (!name) return null;
  return name.length > AD_CLICK_URL_USER_NAME_MAX_LEN
    ? name.slice(0, AD_CLICK_URL_USER_NAME_MAX_LEN)
    : name;
}

function primaryLanguageTag(raw: string): string {
  return raw.trim().toLowerCase().split(/[-_]/)[0] || '';
}

/** Map a raw tag to a supported ad locale, or null if auto/system/empty/unknown. */
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

/**
 * Resolve to a concrete supported locale (never auto/system).
 * Tries candidates in order; unsupported tags are skipped; final fallback `en`.
 */
export function resolveAdClickLocale(
  ...candidates: Array<string | null | undefined>
): AdClickSupportedLocale {
  for (const candidate of candidates) {
    const hit = normalizeAdClickLocale(candidate);
    if (hit) return hit;
  }
  return 'en';
}

export function normalizeAdClickTheme(
  theme: string | null | undefined,
  opts?: { systemIsDark?: boolean },
): 'light' | 'dark' | null {
  const value = theme?.trim().toLowerCase();
  if (value === 'light' || value === 'dark') return value;
  if (value === 'system' || value === 'auto') {
    if (typeof opts?.systemIsDark === 'boolean') {
      return opts.systemIsDark ? 'dark' : 'light';
    }
    return null;
  }
  return null;
}

/** Resolve theme to light/dark. Defaults to light when unresolved. */
export function resolveAdClickTheme(
  theme: string | null | undefined,
  opts?: { systemIsDark?: boolean },
): 'light' | 'dark' {
  return normalizeAdClickTheme(theme, opts) ?? 'light';
}

/** Only http(s) and in-app absolute paths get query personalization. */
export function isPersonalizableClickUrl(clickUrl: string): boolean {
  const trimmed = clickUrl.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return trimmed.startsWith('/') && !trimmed.startsWith('//');
}

function applyClickUrlParams(clickUrl: string, entries: Array<[string, string]>): string {
  const trimmed = clickUrl.trim();
  if (!trimmed || entries.length === 0) return trimmed;
  if (!isPersonalizableClickUrl(trimmed)) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      for (const [key, value] of entries) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    } catch {
      return trimmed;
    }
  }

  const hashIndex = trimmed.indexOf('#');
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const params = new URLSearchParams(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '');
  for (const [key, value] of entries) {
    params.set(key, value);
  }
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ''}${hash}`;
}

export function appendClickUrlQueryParam(
  clickUrl: string,
  key: string,
  value: string,
): string {
  const paramValue = value.trim();
  if (!key || !paramValue) return clickUrl.trim();
  return applyClickUrlParams(clickUrl, [[key, paramValue]]);
}

export function personalizeClickUrl(
  clickUrl: string,
  flags: AdClickUrlPersonalizationFlags,
  values: AdClickUrlPersonalizationValues,
  opts?: { systemIsDark?: boolean },
): string {
  const entries: Array<[string, string]> = [];
  const userName = values.userName?.trim() || null;
  const locale = values.locale?.trim()
    ? resolveAdClickLocale(values.locale)
    : null;
  const theme = normalizeAdClickTheme(values.theme, opts);
  const adToken = values.adToken?.trim() || null;

  if (flags.appendUserNameToClickUrl && userName) {
    entries.push([AD_CLICK_URL_USER_NAME_PARAM, userName]);
  }
  if (flags.appendLocaleToClickUrl && locale) {
    entries.push([AD_CLICK_URL_LOCALE_PARAM, locale]);
  }
  if (flags.appendThemeToClickUrl && theme) {
    entries.push([AD_CLICK_URL_THEME_PARAM, theme]);
  }
  if (flags.appendAdTokenToClickUrl && adToken) {
    entries.push([AD_CLICK_URL_AD_TOKEN_PARAM, adToken]);
  }

  return applyClickUrlParams(clickUrl, entries);
}
