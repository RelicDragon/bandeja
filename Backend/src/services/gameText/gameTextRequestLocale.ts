import { normalizeAppUiLanguage, type AppUiLanguage } from '@bandeja/app-locale';
import type { Request } from 'express';

/**
 * Resolve app UI locale for game-text read projections.
 * Preference: `?locale=` / `?lang=` → `X-App-Locale` → first `Accept-Language` tag → fallback.
 */
export function resolveRequestAppUiLocale(
  req: Pick<Request, 'query' | 'headers'>,
): AppUiLanguage {
  const query = req.query ?? {};
  const fromQuery = firstString(query.locale) ?? firstString(query.lang);
  if (fromQuery) {
    return normalizeAppUiLanguage(fromQuery);
  }

  const headers = req.headers ?? {};
  const fromAppHeader = headerString(headers['x-app-locale']);
  if (fromAppHeader) {
    return normalizeAppUiLanguage(fromAppHeader);
  }

  const accept = headerString(headers['accept-language']);
  if (accept) {
    const first = accept.split(',')[0]?.trim().split(';')[0]?.trim();
    if (first) {
      return normalizeAppUiLanguage(first);
    }
  }

  return normalizeAppUiLanguage(null);
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}

function headerString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}
