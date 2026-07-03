import { BOOKTIME_SNAPSHOT_FRESH_MS } from '@bandeja/shared/gameBooking/booktimeSnapshotFreshness';
import { ApiError } from '../../utils/ApiError';

/** Max snapshot PUTs per user/club/date within {@link BOOKTIME_SNAPSHOT_FRESH_MS}. */
export const BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW = 10;

/** Min interval between global snapshot writes before server returns 429 (freshness / dedupe). */
export const BOOKTIME_SNAPSHOT_PUT_COOLDOWN_MS =
  BOOKTIME_SNAPSHOT_FRESH_MS / BOOKTIME_SNAPSHOT_PUT_MAX_PER_WINDOW;

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
