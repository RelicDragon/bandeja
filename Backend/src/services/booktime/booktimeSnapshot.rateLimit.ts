import {
  BOOKTIME_SNAPSHOT_FRESH_MS,
  BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW,
} from '@bandeja/shared/gameBooking/booktimeSnapshotFreshness';
import { ApiError } from '../../utils/ApiError';

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
    putBuckets.set(key, { count: 1, resetAt: now + BOOKTIME_SNAPSHOT_FRESH_MS });
    return;
  }
  if (bucket.count >= BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW) {
    throw new ApiError(429, 'Snapshot refresh rate limit exceeded');
  }
  bucket.count += 1;
}
