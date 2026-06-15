import { ApiError } from '../../utils/ApiError';

type Bucket = { count: number; resetAt: number };

const PUSH_REPLY_RATE_LIMIT_PER_MIN = 30;
const WINDOW_MS = 60_000;

const buckets = new Map<string, Bucket>();

export function assertPushReplyRateLimit(recipientUserId: string): void {
  const now = Date.now();
  const key = `push-reply:${recipientUserId}`;
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (bucket.count >= PUSH_REPLY_RATE_LIMIT_PER_MIN) {
    throw new ApiError(429, 'Too many push replies, please slow down.', true, {
      code: 'push.replyRateLimited',
    });
  }
  bucket.count += 1;
}

export function resetPushReplyRateLimitForTests(): void {
  buckets.clear();
}
