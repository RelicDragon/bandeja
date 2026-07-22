/** Global `/api/` limiter defaults (prod sizing from #313 / week of access logs). */

export const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Production default: ~2× observed peak IP×15m (~1563). Dev stays loose. */
export const DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION = 3000;
export const DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT = 10000;

/**
 * Pathname prefixes matched against mount-stripped `req.path` under `/api/`
 * (no query string). Only routes that already have dedicated protection (or admin SSE).
 * Auth login/register keep dedicated limiters — do not skip them here.
 */
export const DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES = [
  '/logs/stream',
  '/auth/refresh',
  '/chat/sync/',
  '/chat/unread-objects',
] as const;

export type ApiRateLimitConfig = {
  windowMs: number;
  max: number;
  skipPathPrefixes: string[];
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Reject bare `/` and non-path values so env misconfig cannot disable the limiter. */
export function normalizeSkipPathPrefix(raw: string): string | null {
  const s = raw.trim();
  if (!s.startsWith('/') || s === '/') return null;
  return s;
}

function parseSkipPathPrefixes(raw: string | undefined): string[] {
  if (raw == null) {
    return [...DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES];
  }
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const normalized = normalizeSkipPathPrefix(part);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function resolveApiRateLimitConfig(input: {
  nodeEnv: string;
  windowMsEnv?: string;
  maxEnv?: string;
  /** Comma-separated pathname prefixes (matched at start of `req.path` only). */
  skipPathPrefixesEnv?: string;
}): ApiRateLimitConfig {
  const defaultMax =
    input.nodeEnv === 'production'
      ? DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION
      : DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT;

  return {
    windowMs: parsePositiveInt(input.windowMsEnv, DEFAULT_API_RATE_LIMIT_WINDOW_MS),
    max: parsePositiveInt(input.maxEnv, defaultMax),
    skipPathPrefixes: parseSkipPathPrefixes(input.skipPathPrefixesEnv),
  };
}

/** Strip query/hash so skip rules cannot be poisoned via `?…=/chat/sync/`. */
export function rateLimitPathname(pathOrUrl: string): string {
  const raw = pathOrUrl || '';
  const noHash = raw.split('#')[0] ?? '';
  return noHash.split('?')[0] ?? '';
}

/**
 * True when pathname equals a skip prefix or continues past a path segment boundary.
 * `/chat/unread-objects` matches `/chat/unread-objects` and `/chat/unread-objects/…`,
 * not `/chat/unread-objectss`.
 */
export function pathMatchesSkipPrefix(pathname: string, prefix: string): boolean {
  if (!pathname || !prefix) return false;
  if (prefix.endsWith('/')) {
    return pathname.startsWith(prefix) || pathname === prefix.slice(0, -1);
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * True when pathname equals a skip prefix or starts with it at a segment boundary.
 * Matching uses the pathname only (query/hash stripped) and is anchored at the start.
 */
export function shouldSkipApiRateLimit(
  pathOrUrl: string,
  skipPathPrefixes: readonly string[]
): boolean {
  const pathname = rateLimitPathname(pathOrUrl);
  if (!pathname) return false;
  return skipPathPrefixes.some((prefix) => pathMatchesSkipPrefix(pathname, prefix));
}
