export const LINK_PREVIEW_MAX_PER_WINDOW = 40;
export const LINK_PREVIEW_WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function resetLinkPreviewRateLimitForTests(): void {
  buckets.clear();
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function tryConsumeLinkPreviewRateLimit(userId: string): boolean {
  const key = `link-preview:${userId}`;
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + LINK_PREVIEW_WINDOW_MS });
    return true;
  }
  if (bucket.count >= LINK_PREVIEW_MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}
