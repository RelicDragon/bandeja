/**
 * `web_fetch` page reader (port of travel-bandeja `webFetch/webFetchService.js`,
 * docs/plans/ai-agent-web-search.md §13.7.3).
 *
 * `fetchWebPage(url)` downloads one page with manual redirects (≤ 5, cycle-proof), every
 * hop re-checked by the SSRF guard and connected through a pinned dispatcher; caps time,
 * bytes and content type; extracts plain text. Never throws: failures are
 * `{ ok: false, code }`. Raw error messages and URL paths never leave this module (no
 * logs either). In-memory cache + single-flight by canonical URL; the `admit` hook (global
 * limit) runs only on a miss.
 */
import { Agent, fetch as undiciFetch } from 'undici';
import { agentWebEnv, AGENT_WEB_FETCH_HARD_MAX_CHARS, type AgentWebEnvConfig } from '../../../../config/agentWebEnv';
import { TtlCache } from '../webTtlCache';
import { canonicalizeUrl, safeHttpUrl } from '../webUrl';
import { htmlToText, looksLikeHtml, plainTextToPage, truncateText } from './htmlToText';
import { closeDispatcher, createPinnedDispatcher } from './pinnedDispatcher';
import { checkUrlShape, resolveHostSafety, type DnsLookup } from './ssrfGuard';

export const MAX_REDIRECTS = 5;

export const WEB_FETCH_USER_AGENT = 'Mozilla/5.0 (compatible; BandejaAgent/1.0; +https://bandeja.me)';

export type WebFetchErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  | 'TOO_MANY_REDIRECTS'
  | 'HTTP_ERROR'
  | 'UNSUPPORTED_CONTENT_TYPE'
  | 'TOO_LARGE'
  | 'NO_CONTENT'
  | 'FETCH_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED';

export type WebFetchSuccess = {
  ok: true;
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
  charCount: number;
  truncated: boolean;
  redirected: boolean;
  contentType: string;
  cached: boolean;
  /** Shared another caller's in-flight fetch (no network of its own). */
  joined?: true;
};

export type WebFetchFailure = { ok: false; code: WebFetchErrorCode; status?: number };

export type WebFetchOutcome = WebFetchSuccess | WebFetchFailure;

export type WebFetchInit = {
  method: 'GET';
  redirect: 'manual';
  headers: Record<string, string>;
  signal: AbortSignal;
  dispatcher?: Agent;
};

export type WebFetchImpl = (url: string, init: WebFetchInit) => Promise<Response>;

export type WebFetchOptions = {
  fetchImpl?: WebFetchImpl;
  lookup?: DnsLookup;
  signal?: AbortSignal;
  maxChars?: number;
  /** `Accept-Language` primary tag (the run locale). */
  locale?: string;
  /** Global limit, called once on a cache miss right before the network. */
  admit?: () => Promise<boolean>;
  env?: AgentWebEnvConfig;
  now?: () => number;
};

const READABLE_TYPE = /^(text\/html|application\/xhtml\+xml|text\/plain)$/i;

const defaultFetch: WebFetchImpl = (url, init) => undiciFetch(url, init) as unknown as Promise<Response>;

class FetchStop extends Error {
  constructor(
    readonly code: WebFetchErrorCode,
    readonly status?: number,
  ) {
    super(code);
  }
}

let cacheClock: () => number = Date.now;
const pageCache = new TtlCache<WebFetchSuccess>({
  ttlMs: () => agentWebEnv().fetchCacheTtlMs,
  max: () => agentWebEnv().fetchCacheMax,
  now: () => cacheClock(),
});

/** Tests: clear the cache and optionally pin its clock. */
export function resetWebFetchState(now: () => number = Date.now): void {
  pageCache.clear();
  cacheClock = now;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    /* best effort */
  }
}

async function readCappedBody(response: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') return { bytes: new Uint8Array(0), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) continue;
      if (received + value.byteLength > maxBytes) {
        const allowance = maxBytes - received;
        if (allowance > 0) chunks.push(value.slice(0, allowance));
        received = maxBytes;
        truncated = true;
        break;
      }
      received += value.byteLength;
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* finished or errored */
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return { bytes: out, truncated };
}

function charsetFromMeta(bytes: Uint8Array): string | null {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 4096));
  const m =
    /<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(head) ??
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-type["'][^>]*charset=([\w-]+)/i.exec(head);
  return m ? m[1].toLowerCase() : null;
}

function decodeBody(bytes: Uint8Array, contentType: string): string {
  const header = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const charset = (header ?? charsetFromMeta(bytes) ?? 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function acceptLanguage(locale: string | undefined): string {
  const base = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return base && base !== 'en' && /^[a-z]{2,3}$/.test(base) ? `${base},en;q=0.8` : 'en';
}

async function performFetch(
  start: URL,
  env: AgentWebEnvConfig,
  opts: WebFetchOptions,
): Promise<WebFetchOutcome> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch;
  const timeout = AbortSignal.timeout(env.fetchTimeoutMs);
  const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
  const headers = {
    'User-Agent': WEB_FETCH_USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
    'Accept-Language': acceptLanguage(opts.locale),
  };
  let url = start.href;
  let redirected = false;
  const visited = new Set<string>();
  let dispatcher: Agent | null = null;
  try {
    for (let hop = 0; ; hop += 1) {
      if (hop > MAX_REDIRECTS) throw new FetchStop('TOO_MANY_REDIRECTS');
      const current = safeHttpUrl(url);
      if (!current) throw new FetchStop('BLOCKED_HOST');
      const key = canonicalizeUrl(current) ?? current.href;
      if (visited.has(key)) throw new FetchStop('TOO_MANY_REDIRECTS');
      visited.add(key);
      if (checkUrlShape(current)) throw new FetchStop('BLOCKED_HOST');
      const safety = await resolveHostSafety(current.hostname, { lookup: opts.lookup });
      if (!safety.safe) throw new FetchStop('BLOCKED_HOST');
      if (signal.aborted) throw new FetchStop(timeout.aborted ? 'TIMEOUT' : 'FETCH_FAILED');

      await closeDispatcher(dispatcher);
      dispatcher = createPinnedDispatcher(safety.addresses);
      const response = await fetchImpl(current.href, { method: 'GET', redirect: 'manual', headers, signal, dispatcher });

      if (response.status >= 300 && response.status < 400 && response.status !== 304) {
        const location = response.headers.get('location');
        await cancelBody(response);
        if (!location) throw new FetchStop('HTTP_ERROR', response.status);
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          throw new FetchStop('BLOCKED_HOST');
        }
        if (!safeHttpUrl(next.href)) throw new FetchStop('BLOCKED_HOST');
        url = next.href;
        redirected = true;
        continue;
      }
      if (!response.ok) {
        await cancelBody(response);
        throw new FetchStop('HTTP_ERROR', response.status);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const mediaType = contentType.split(';')[0].trim().toLowerCase();
      const unknownType = !mediaType || mediaType === 'application/octet-stream';
      if (!unknownType && !READABLE_TYPE.test(mediaType)) {
        await cancelBody(response);
        throw new FetchStop('UNSUPPORTED_CONTENT_TYPE');
      }
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > env.fetchMaxBytes * 4) {
        await cancelBody(response);
        throw new FetchStop('TOO_LARGE');
      }
      const body = await readCappedBody(response, env.fetchMaxBytes);
      if (body.bytes.byteLength === 0) throw new FetchStop('NO_CONTENT');
      const decoded = decodeBody(body.bytes, contentType);
      if (unknownType && !looksLikeHtml(decoded.slice(0, 2048))) throw new FetchStop('UNSUPPORTED_CONTENT_TYPE');
      const isPlain = mediaType === 'text/plain';
      const page = isPlain ? plainTextToPage(decoded, AGENT_WEB_FETCH_HARD_MAX_CHARS) : htmlToText(decoded, AGENT_WEB_FETCH_HARD_MAX_CHARS);
      if (!page.text) throw new FetchStop('NO_CONTENT');
      return {
        ok: true,
        url: start.href,
        finalUrl: current.href,
        title: page.title,
        description: page.description,
        text: page.text,
        charCount: page.text.length,
        truncated: page.truncated || body.truncated,
        redirected,
        contentType: unknownType ? 'text/html' : mediaType,
        cached: false,
      };
    }
  } catch (error) {
    if (error instanceof FetchStop) return { ok: false, code: error.code, ...(error.status ? { status: error.status } : {}) };
    if (timeout.aborted) return { ok: false, code: 'TIMEOUT' };
    return { ok: false, code: 'FETCH_FAILED' };
  } finally {
    await closeDispatcher(dispatcher);
  }
}

function trimTo(result: WebFetchSuccess, maxChars: number): WebFetchSuccess {
  if (result.text.length <= maxChars) return result;
  const { text } = truncateText(result.text, maxChars);
  return { ...result, text, charCount: text.length, truncated: true };
}

/** Download, extract and cache one page. Never rejects. */
export async function fetchWebPage(rawUrl: unknown, opts: WebFetchOptions = {}): Promise<WebFetchOutcome> {
  const env = opts.env ?? agentWebEnv();
  const url = safeHttpUrl(rawUrl);
  if (!url) return { ok: false, code: 'INVALID_URL' };
  url.hash = ''; // never sent to a server anyway
  if (checkUrlShape(url)) return { ok: false, code: 'BLOCKED_HOST' };
  const requested = Number(opts.maxChars);
  const maxChars = Math.min(
    AGENT_WEB_FETCH_HARD_MAX_CHARS,
    Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : env.fetchMaxChars,
  );
  const key = canonicalizeUrl(url) ?? url.href;

  const hit = pageCache.get(key);
  if (hit) return trimTo({ ...hit, cached: true }, maxChars);

  const flight = pageCache.singleFlight<WebFetchOutcome>(key, async () => {
    if (opts.admit && !(await opts.admit())) return { ok: false, code: 'RATE_LIMITED' };
    const outcome = await performFetch(url, env, opts);
    if (outcome.ok) pageCache.set(key, outcome);
    return outcome;
  });
  const outcome = await flight.promise;
  if (!outcome.ok) return outcome;
  return trimTo(flight.joined ? { ...outcome, joined: true } : outcome, maxChars);
}
