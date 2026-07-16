/** Max personal sticker saves per user per window. */
export const PERSONAL_STICKER_SAVE_MAX_PER_WINDOW = 20;
export const PERSONAL_STICKER_SAVE_WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Test helper — clear in-memory buckets. */
export function resetPersonalStickerSaveRateLimitForTests(): void {
  buckets.clear();
}

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

/** Returns false when limited. */
export function tryConsumePersonalStickerSaveRateLimit(userId: string): boolean {
  const key = `personal-sticker-save:${userId}`;
  const now = Date.now();
  pruneExpiredBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + PERSONAL_STICKER_SAVE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= PERSONAL_STICKER_SAVE_MAX_PER_WINDOW) {
    return false;
  }
  bucket.count += 1;
  return true;
}
