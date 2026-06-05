import { getRedisClient, isRedisConfigured } from '../redis/redisClient';
import type { CachedAdCampaign } from './ad.cache';

const CACHE_KEY = 'pp:ads:campaigns';
const CACHE_TTL_SEC = 300;

export function isAdsRedisCacheEnabled(): boolean {
  if (process.env.ADS_REDIS_CACHE === 'false') return false;
  return isRedisConfigured();
}

export class AdCampaignRedisCache {
  static async get(): Promise<CachedAdCampaign[] | null> {
    if (!isAdsRedisCacheEnabled()) return null;
    const redis = await getRedisClient();
    if (!redis) return null;
    try {
      const raw = await redis.get(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedAdCampaign[];
    } catch {
      return null;
    }
  }

  static async set(campaigns: CachedAdCampaign[]): Promise<void> {
    if (!isAdsRedisCacheEnabled()) return;
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.set(CACHE_KEY, JSON.stringify(campaigns), { EX: CACHE_TTL_SEC });
    } catch (err) {
      console.error('[ads] redis cache set failed', err);
    }
  }

  static async invalidate(): Promise<void> {
    if (!isAdsRedisCacheEnabled()) return;
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.del(CACHE_KEY);
    } catch {
      /* best-effort */
    }
  }
}
