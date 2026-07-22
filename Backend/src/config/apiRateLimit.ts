/** Global `/api/` limiter defaults (prod sizing from #313 / week of access logs). */

export const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Production default: ~2× observed peak IP×15m (~1563). Dev stays loose. */
export const DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION = 3000;
export const DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT = 10000;

/**
 * Pathname prefixes matched against mount-stripped `req.path` under `/api/`
 * (no query string). Auth login/register keep dedicated limiters — do not skip them here.
 */
export const DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES = [
  '/logs/stream',
  '/auth/refresh',
  '/chat/sync/',
  '/chat/messages/missed',
  '/chat/unread',
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

function parseSkipPathPrefixes(raw: string | undefined): string[] {
  if (raw == null) {
    return [...DEFAULT_API_RATE_LIMIT_SKIP_PATH_PREFIXES];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
 * True when pathname equals a skip prefix or starts with it.
 * Matching is anchored at the start of the path (not an arbitrary substring).
 */
export function shouldSkipApiRateLimit(
  pathOrUrl: string,
  skipPathPrefixes: readonly string[]
): boolean {
  const pathname = rateLimitPathname(pathOrUrl);
  if (!pathname) return false;
  return skipPathPrefixes.some((prefix) => {
    if (!prefix) return false;
    return pathname === prefix || pathname.startsWith(prefix);
  });
}
