/** Max Giphy ingest attempts per user per window. */
import { consumeDistributedRateLimit } from './distributedRateLimit';

export const GIPHY_INGEST_MAX_PER_WINDOW = 10;
export const GIPHY_INGEST_WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Test helper — clear in-memory buckets. */
export function resetGiphyIngestRateLimitForTests(): void {
  buckets.clear();
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/**
 * Per-user rate limit for Giphy URL ingest (separate from createMessage limiter).
 * Returns false when limited — caller soft-skips conversion and keeps TEXT (create still succeeds).
 */
export function tryConsumeGiphyIngestRateLimit(userId: string): boolean {
  const key = `giphy-ingest:${userId}`;
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + GIPHY_INGEST_WINDOW_MS });
    return true;
  }
  if (bucket.count >= GIPHY_INGEST_MAX_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function consumeGiphyIngestRateLimit(userId: string): Promise<boolean> {
  return consumeDistributedRateLimit(
    `giphy-ingest:${userId}`,
    GIPHY_INGEST_MAX_PER_WINDOW,
    GIPHY_INGEST_WINDOW_MS,
    () => tryConsumeGiphyIngestRateLimit(userId)
  );
}
