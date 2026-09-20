/**
 * PRD 356 — one group `/play` post per user per 6 h per group.
 *
 * Redis-backed (`SET NX PX`) with a bounded in-process fallback, so a bot
 * running without `REDIS_URL` still rate-limits rather than letting a single
 * user spam a club group.
 *
 * Failing open is the deliberate choice on a storage error: a rare duplicate
 * post is better than `/play` silently dying in every group.
 */
import { getRedisClient } from '../redis/redisClient';

export const GROUP_PLAY_POST_TTL_MS = 6 * 60 * 60 * 1000;

/** Fallback only — bounded so a long-lived process cannot grow it forever. */
const MEMORY_LIMIT = 5000;
const memoryClaims = new Map<string, number>();

export function groupPlayPostKey(chatId: string, userId: string): string {
  return `tg:play-group:${chatId}:${userId}`;
}

function pruneMemory(now: number): void {
  for (const [key, expiresAt] of memoryClaims) {
    if (expiresAt <= now) memoryClaims.delete(key);
  }
  if (memoryClaims.size <= MEMORY_LIMIT) return;
  // Still too big after pruning: drop the oldest half by insertion order.
  const excess = memoryClaims.size - MEMORY_LIMIT;
  let dropped = 0;
  for (const key of memoryClaims.keys()) {
    memoryClaims.delete(key);
    dropped += 1;
    if (dropped >= excess) break;
  }
}

/** In-memory claim, used when Redis is unavailable. Exported for tests. */
export function claimGroupPlayPostInMemory(
  key: string,
  ttlMs = GROUP_PLAY_POST_TTL_MS,
  now = Date.now(),
): boolean {
  pruneMemory(now);
  const held = memoryClaims.get(key);
  if (held && held > now) return false;
  memoryClaims.set(key, now + ttlMs);
  return true;
}

export function resetGroupPlayPostLimitForTests(): void {
  memoryClaims.clear();
}

/**
 * Take the 6 h slot for `(chatId, userId)`, or return `false` when it is still
 * held.
 */
export async function claimGroupPlayPost(
  chatId: string,
  userId: string,
  ttlMs = GROUP_PLAY_POST_TTL_MS,
): Promise<boolean> {
  const key = groupPlayPostKey(chatId, userId);
  try {
    const redis = await getRedisClient();
    if (redis) {
      const result = await redis.set(key, String(Date.now()), { NX: true, PX: ttlMs });
      return result === 'OK';
    }
  } catch {
    // fall through to the in-process fallback
  }
  return claimGroupPlayPostInMemory(key, ttlMs);
}
