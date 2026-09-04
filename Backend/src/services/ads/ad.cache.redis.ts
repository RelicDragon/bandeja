import { getRedisClient, isRedisConfigured } from '../redis/redisClient';
import type { CachedAdCampaign } from './ad.cache';

const CACHE_KEY = 'pp:ads:campaigns:v4';
const CACHE_TTL_SEC = 300;

function reviveCachedDate(value: unknown, nullable: true): Date | null;
function reviveCachedDate(value: unknown, nullable?: false): Date;
function reviveCachedDate(value: unknown, nullable = false): Date | null {
  if (value == null && nullable) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date in Ads campaign cache');
  return date;
}

export function deserializeCachedAdCampaigns(raw: string): CachedAdCampaign[] {
  const campaigns = JSON.parse(raw) as CachedAdCampaign[];
  return campaigns.map((campaign) => ({
    ...campaign,
    startsAt: reviveCachedDate(campaign.startsAt, true),
    endsAt: reviveCachedDate(campaign.endsAt, true),
    calendarTagStartsAt: reviveCachedDate(campaign.calendarTagStartsAt, true),
    calendarTagEndsAt: reviveCachedDate(campaign.calendarTagEndsAt, true),
    createdAt: reviveCachedDate(campaign.createdAt),
    updatedAt: reviveCachedDate(campaign.updatedAt),
    creatives: campaign.creatives.map((creative) => ({
      ...creative,
      createdAt: reviveCachedDate(creative.createdAt),
      updatedAt: reviveCachedDate(creative.updatedAt),
    })),
  }));
}

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
      return deserializeCachedAdCampaigns(raw);
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
