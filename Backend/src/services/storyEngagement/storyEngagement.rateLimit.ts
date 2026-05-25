import { ApiError } from '../../utils/ApiError';
import {
  COMMENT_RATE_LIMIT_PER_MIN,
  LIKE_TOGGLE_RATE_LIMIT_PER_MIN,
  STORY_ENGAGEMENT_ERROR,
} from './storyEngagement.constants';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function checkRateLimit(key: string, max: number, windowMs: number, code: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= max) {
    throw new ApiError(429, 'Rate limit exceeded', true, { code });
  }
  bucket.count += 1;
}

export function assertCommentRateLimit(userId: string): void {
  if (process.env.STORY_ENGAGEMENT_SKIP_RATE_LIMIT === '1') return;
  checkRateLimit(
    `comment:${userId}`,
    COMMENT_RATE_LIMIT_PER_MIN,
    60_000,
    STORY_ENGAGEMENT_ERROR.COMMENT_RATE_LIMIT
  );
}

export function assertLikeToggleRateLimit(userId: string): void {
  checkRateLimit(`like:${userId}`, LIKE_TOGGLE_RATE_LIMIT_PER_MIN, 60_000, 'STORY_LIKE_RATE_LIMIT');
}
