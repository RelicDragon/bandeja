/** Global `/api/` limiter defaults (prod sizing from #313 / week of access logs). */

export const DEFAULT_API_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Production default: ~2× observed peak IP×15m (~1563). Dev stays loose. */
export const DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION = 3000;
export const DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT = 10000;

/**
 * Substrings matched against `req.path` (mount-stripped under `/api/`) or `originalUrl`.
 * Auth login/register keep dedicated limiters — do not skip them here.
 */
export const DEFAULT_API_RATE_LIMIT_SKIP_SUBSTRINGS = [
  '/logs/stream',
  '/auth/refresh',
  '/chat/sync/',
  '/chat/messages/missed',
  '/chat/unread',
] as const;

export type ApiRateLimitConfig = {
  windowMs: number;
  max: number;
  skipPathSubstrings: string[];
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseSkipSubstrings(raw: string | undefined): string[] {
  if (raw == null) {
    return [...DEFAULT_API_RATE_LIMIT_SKIP_SUBSTRINGS];
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
  skipPathSubstringsEnv?: string;
}): ApiRateLimitConfig {
  const defaultMax =
    input.nodeEnv === 'production'
      ? DEFAULT_API_RATE_LIMIT_MAX_PRODUCTION
      : DEFAULT_API_RATE_LIMIT_MAX_DEVELOPMENT;

  return {
    windowMs: parsePositiveInt(input.windowMsEnv, DEFAULT_API_RATE_LIMIT_WINDOW_MS),
    max: parsePositiveInt(input.maxEnv, defaultMax),
    skipPathSubstrings: parseSkipSubstrings(input.skipPathSubstringsEnv),
  };
}

export function shouldSkipApiRateLimit(
  pathOrUrl: string,
  skipPathSubstrings: readonly string[]
): boolean {
  const p = pathOrUrl || '';
  return skipPathSubstrings.some((s) => s.length > 0 && p.includes(s));
}
