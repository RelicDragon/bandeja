/**
 * DuckDuckGo HTML adapter, the keyless last resort (port of travel-bandeja
 * `providers/duckDuckGoSearch.js`).
 *
 * Off by default (`AGENT_WEB_SEARCH_DDG_ENABLED`): scraping is ToS-fragile. When enabled
 * the chain appends it after every keyed provider. Parsing is defensive: malformed HTML
 * yields fewer results, never a throw.
 */
import { WebSearchError, networkError, type WebSearchErrorKind } from '../webSearchError';
import {
  SEARCH_USER_AGENT,
  clampCount,
  normalizeResults,
  timeoutSignal,
  type WebSearchProvider,
} from '../providerUtils';

export const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');
}

function stripTags(html: string): string {
  return String(html || '').replace(/<[^>]*>/g, '').trim();
}

/** `//duckduckgo.com/l/?uddg=<encoded>` → the real target; absolute http(s) hrefs pass. */
function extractRealUrl(rawHref: string): string {
  const href = String(rawHref || '').trim();
  if (!href) return '';
  const uddg = /[?&]uddg=([^&]+)/i.exec(href);
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1]);
    } catch {
      return '';
    }
  }
  return /^https?:\/\//i.test(href) ? href : '';
}

function attr(attrs: string, name: string): string {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

export function parseDuckDuckGoHtml(html: string, count: number): { title: string; url: string; snippet: string }[] {
  if (typeof html !== 'string' || !html) return [];
  const titles: { url: string; title: string }[] = [];
  const snippets: string[] = [];
  const aRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = aRegex.exec(html)) !== null) {
    const className = attr(m[1], 'class');
    const inner = decodeEntities(stripTags(m[2]));
    if (/\bresult__a\b/.test(className)) {
      const url = extractRealUrl(decodeEntities(attr(m[1], 'href')));
      if (url && inner) titles.push({ url, title: inner });
    } else if (/\bresult__snippet\b/.test(className)) {
      snippets.push(inner);
    }
  }
  return titles.slice(0, count).map((t, i) => ({ title: t.title, url: t.url, snippet: snippets[i] ?? '' }));
}

export const duckDuckGoProvider: WebSearchProvider = {
  name: 'duckduckgo',
  keyed: false,

  isConfigured(env) {
    return env.ddgEnabled;
  },

  async search({ query, count, fetchImpl, signal, env }) {
    const clamped = clampCount(count);
    const url = new URL(DDG_ENDPOINT);
    url.searchParams.set('q', query);
    let response: Response;
    try {
      // GET: DDG serves a 202 bot page to POSTs from datacenter IPs.
      response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'text/html', 'User-Agent': SEARCH_USER_AGENT },
        signal: timeoutSignal(env.searchTimeoutMs, signal),
      });
    } catch (err) {
      throw networkError('duckduckgo', err);
    }
    if (!response.ok || response.status === 202) {
      const status = response.status;
      let kind: WebSearchErrorKind = 'unknown';
      if (status === 202 || status === 429) kind = 'rate_limited';
      else if (status === 401 || status === 403) kind = 'auth';
      else if (status >= 500) kind = 'server';
      throw new WebSearchError(`DuckDuckGo error (${status})`, { kind, status, provider: 'duckduckgo' });
    }
    let html: string;
    try {
      html = await response.text();
    } catch {
      throw new WebSearchError('DuckDuckGo response read failed', { kind: 'unknown', provider: 'duckduckgo' });
    }
    return { results: normalizeResults(parseDuckDuckGoHtml(html, clamped), clamped) };
  },
};
