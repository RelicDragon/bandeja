import { getRedisClient } from '../redis/redisClient';
import { TtlCache } from '../../utils/ttlCache';

/**
 * Club report cache (docs/domains/club-admin.md "Reports"). Keys embed a per-club generation
 * number; billing and pricing mutations bump it, which orphans every cached report of that club
 * at once (no key scans). Redis when configured, else a process-local fallback.
 */

const PREFIX = 'pp:clubadmin:reports:v1';
const GEN_TTL_SEC = 30 * 24 * 3600;
const localGen = new Map<string, number>();
const localCache = new TtlCache<string, string>(10 * 60 * 1000);

function genKey(clubId: string): string {
  return `${PREFIX}:gen:${clubId}`;
}

async function generation(clubId: string): Promise<string> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      return (await redis.get(genKey(clubId))) ?? '0';
    } catch {
      return 'x';
    }
  }
  return String(localGen.get(clubId) ?? 0);
}

/** Orphans every cached report of the club. Never throws. */
export async function invalidateClubReports(clubId: string): Promise<void> {
  localGen.set(clubId, (localGen.get(clubId) ?? 0) + 1);
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.incr(genKey(clubId));
    await redis.expire(genKey(clubId), GEN_TTL_SEC);
  } catch (err) {
    console.error('[clubAdmin] report cache invalidate failed', err);
  }
}

/** Cached JSON value for `parts` of this club, computing it on a miss. `ttlSec` per entry. */
export async function cachedClubReport<T>(clubId: string, parts: string[], ttlSec: number, compute: () => Promise<T>): Promise<T> {
  const gen = await generation(clubId);
  const key = `${PREFIX}:${clubId}:${gen}:${parts.join(':')}`;
  const redis = gen === 'x' ? null : await getRedisClient();
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // fall through to compute
    }
  } else if (gen !== 'x') {
    const hit = localCache.get(key);
    if (hit) return JSON.parse(hit) as T;
  }
  const value = await compute();
  const raw = JSON.stringify(value);
  if (redis) {
    try {
      await redis.set(key, raw, { EX: ttlSec });
    } catch (err) {
      console.error('[clubAdmin] report cache set failed', err);
    }
  } else if (gen !== 'x' && ttlSec >= 600) {
    localCache.set(key, raw);
  }
  return value;
}
