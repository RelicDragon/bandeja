import { ApiError } from '../../utils/ApiError';

const SNAPSHOT_PUT_RATE_LIMIT_MS = 60 * 1000;

type Bucket = { count: number; resetAt: number };

const putBuckets = new Map<string, Bucket>();

export function assertSnapshotPutRateLimit(
  userId: string,
  clubId: string,
  date: string,
  force = false
): void {
  if (force) return;
  const key = `snapshot-put:${userId}:${clubId}:${date}`;
  const now = Date.now();
  const bucket = putBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    putBuckets.set(key, { count: 1, resetAt: now + SNAPSHOT_PUT_RATE_LIMIT_MS });
    return;
  }
  if (bucket.count >= 1) {
    throw new ApiError(429, 'Snapshot refresh rate limit exceeded');
  }
  bucket.count += 1;
}
