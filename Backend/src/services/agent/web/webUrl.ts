/**
 * URL helpers for the web tools (port of
 * `safeHttpUrl` / `canonicalizeUrl` in travel-bandeja `webFetchService.js`).
 *
 * The canonical form is the identity used by the fetch cache AND the `web_fetch`
 * allowlist: tracking params, fragment, default port and trailing slash are dropped and
 * the remaining params sorted, so the model can only ever remove noise, never add or
 * change a parameter of an allowed URL.
 */

const STRIPPABLE_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'igshid',
  'mc_eid',
  'mc_cid',
  'ref_src',
  '_hsenc',
  '_hsmi',
  'yclid',
  'msclkid',
  'wbraid',
  'gbraid',
]);

/** Parse an absolute http(s) URL, else null. */
export function safeHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string' && !(value instanceof URL)) return null;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function canonicalizeUrl(value: unknown): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (STRIPPABLE_QUERY_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = '';
  url.searchParams.sort();
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  const port = url.port && !((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) ? `:${url.port}` : '';
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const qs = url.searchParams.toString();
  return `${url.protocol}//${host}${port}${path}${qs ? `?${qs}` : ''}`;
}

/** Hostname without `www.`, for display. */
export function displayHost(value: unknown): string {
  const url = safeHttpUrl(value);
  if (!url) return '';
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCTUATION = /[).,;:!?\]}>»"'…]+$/;
export const MAX_URLS_FROM_TEXT = 20;

/** http(s) URLs a person typed (trailing punctuation trimmed), at most 20. */
export function extractUrlsFromText(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(URL_IN_TEXT)) {
    if (out.length >= MAX_URLS_FROM_TEXT) break;
    let candidate = match[0];
    // Keep a closing paren that belongs to the URL ("…/Padel_(sport)").
    while (TRAILING_PUNCTUATION.test(candidate)) {
      const last = candidate.slice(-1);
      if (last === ')' && (candidate.match(/\(/g)?.length ?? 0) >= (candidate.match(/\)/g)?.length ?? 0)) break;
      candidate = candidate.slice(0, -1);
    }
    if (safeHttpUrl(candidate)) out.push(candidate);
  }
  return out;
}
