/** Max Giphy search/trending requests per user per window. */
import { consumeDistributedRateLimit } from './distributedRateLimit';

export const GIPHY_SEARCH_MAX_PER_WINDOW = 30;
export const GIPHY_SEARCH_WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function resetGiphySearchRateLimitForTests(): void {
  buckets.clear();
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * Per-user rate limit for Giphy catalog search (separate from ingest).
 * Returns false when limited.
 */
export function tryConsumeGiphySearchRateLimit(userId: string): boolean {
  const key = `giphy-search:${userId}`;
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + GIPHY_SEARCH_WINDOW_MS });
    return true;
  }
  if (bucket.count >= GIPHY_SEARCH_MAX_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function consumeGiphySearchRateLimit(userId: string): Promise<boolean> {
  return consumeDistributedRateLimit(
    `giphy-search:${userId}`,
    GIPHY_SEARCH_MAX_PER_WINDOW,
    GIPHY_SEARCH_WINDOW_MS,
    () => tryConsumeGiphySearchRateLimit(userId)
  );
}
