/**
 * Error model of the web search chain (port of travel-bandeja `webSearchError.js`).
 *
 * Adapters throw a `WebSearchError` with raw HTTP facts; the chain classifies it and the
 * health tracker turns the kind into a cooldown. Messages are written by the adapters
 * ("Brave API error (429)") and never contain a URL, header or key.
 */

export type WebSearchErrorKind = 'rate_limited' | 'auth' | 'server' | 'network' | 'unknown';

export class WebSearchError extends Error {
  readonly kind: WebSearchErrorKind;
  readonly retryAfterMs: number | null;
  readonly status: number | null;
  readonly provider: string | null;

  constructor(
    message: string,
    opts: { kind?: WebSearchErrorKind; retryAfterMs?: number | null; status?: number | null; provider?: string | null } = {},
  ) {
    super(message);
    this.name = 'WebSearchError';
    this.kind = opts.kind ?? 'unknown';
    this.retryAfterMs = typeof opts.retryAfterMs === 'number' && Number.isFinite(opts.retryAfterMs) ? opts.retryAfterMs : null;
    this.status = typeof opts.status === 'number' && Number.isFinite(opts.status) ? opts.status : null;
    this.provider = opts.provider ?? null;
  }
}

/** Base cooldown per kind; the tracker multiplies it by consecutive failures (capped). */
export const COOLDOWN_MS_BY_KIND: Record<WebSearchErrorKind, number> = {
  rate_limited: 60_000,
  auth: 5 * 60_000,
  server: 30_000,
  network: 15_000,
  unknown: 15_000,
};

/** Kinds that mean the provider itself is sick; a one-off 400 must not cool it globally. */
export const COOLDOWN_KINDS: ReadonlySet<WebSearchErrorKind> = new Set(['rate_limited', 'auth', 'server', 'network']);

export const MAX_RETRY_AFTER_MS = 15 * 60_000;

/** `Retry-After` as delta-seconds or HTTP-date → ms from now (capped 15 min), or null. */
export function parseRetryAfter(value: string | number | null | undefined, now: () => number = Date.now): number | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const seconds = Number(str);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.ceil(seconds) * 1000, MAX_RETRY_AFTER_MS);
  }
  const date = Date.parse(str);
  if (Number.isFinite(date)) {
    const ms = date - now();
    return ms > 0 ? Math.min(ms, MAX_RETRY_AFTER_MS) : 0;
  }
  return null;
}

type HeaderBag = { get(name: string): string | null } | Record<string, string | undefined> | null | undefined;

function readRetryAfter(headers: HeaderBag, now: () => number): number | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return parseRetryAfter((headers as { get(name: string): string | null }).get('retry-after'), now);
  }
  const bag = headers as Record<string, string | undefined>;
  const key = Object.keys(bag).find((k) => k.toLowerCase() === 'retry-after');
  return parseRetryAfter(key ? bag[key] : undefined, now);
}

export function classifyHttpError(
  status: number,
  headers?: HeaderBag,
  now: () => number = Date.now,
): { kind: WebSearchErrorKind; retryAfterMs: number | null } {
  if (status === 429) return { kind: 'rate_limited', retryAfterMs: readRetryAfter(headers, now) };
  if (status === 401 || status === 403) return { kind: 'auth', retryAfterMs: null };
  if (status >= 500) return { kind: 'server', retryAfterMs: null };
  return { kind: 'unknown', retryAfterMs: null };
}

export function isAbortLike(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Classify a thrown error. `message` is for server logs only. */
export function classifyError(err: unknown): { kind: WebSearchErrorKind; retryAfterMs: number | null; message: string } {
  if (err instanceof WebSearchError) {
    return { kind: err.kind, retryAfterMs: err.retryAfterMs, message: err.message };
  }
  const message = err instanceof Error ? err.message : 'unknown error';
  if (isAbortLike(err) || /timeout|abort/i.test(message)) {
    return { kind: 'network', retryAfterMs: null, message: message || 'timeout' };
  }
  return { kind: 'unknown', retryAfterMs: null, message };
}

/** Network failure of a provider request → `WebSearchError` without the raw message (it may hold a URL). */
export function networkError(provider: string, err: unknown): WebSearchError {
  return new WebSearchError(`${provider} request failed (${isAbortLike(err) ? 'timeout' : 'network'})`, {
    kind: 'network',
    provider,
  });
}
