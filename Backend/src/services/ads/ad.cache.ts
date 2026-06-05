import prisma from '../../config/database';
import { AdCampaignStatus } from '@prisma/client';
import { AdCampaignRedisCache } from './ad.cache.redis';

export type CachedAdCampaign = Awaited<ReturnType<typeof AdCampaignCache.loadFromDb>>[number];

let cachedCampaigns: CachedAdCampaign[] = [];
let lastCacheUpdate = 0;
let cacheRefreshPromise: Promise<void> | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export class AdCampaignCache {
  static async getCampaigns(): Promise<CachedAdCampaign[]> {
    await this.refreshCacheIfNeeded();
    return cachedCampaigns;
  }

  static async refreshCacheIfNeeded() {
    const now = Date.now();
    if (now - lastCacheUpdate > CACHE_TTL) {
      if (!cacheRefreshPromise) {
        cacheRefreshPromise = this.refreshCache().finally(() => {
          cacheRefreshPromise = null;
        });
      }
      await cacheRefreshPromise;
    }
  }

  static async refreshCache() {
    const fromRedis = await AdCampaignRedisCache.get();
    if (fromRedis) {
      cachedCampaigns = fromRedis;
      lastCacheUpdate = Date.now();
      return;
    }

    cachedCampaigns = await this.loadFromDb();
    lastCacheUpdate = Date.now();
    await AdCampaignRedisCache.set(cachedCampaigns);
  }

  static clearCache() {
    cachedCampaigns = [];
    lastCacheUpdate = 0;
    cacheRefreshPromise = null;
    void AdCampaignRedisCache.invalidate();
  }

  static async loadFromDb() {
    return prisma.adCampaign.findMany({
      where: {
        status: {
          in: [AdCampaignStatus.ACTIVE, AdCampaignStatus.DRAFT, AdCampaignStatus.SCHEDULED],
        },
      },
      include: {
        creatives: true,
        placements: true,
        sponsor: { select: { id: true, name: true } },
      },
    });
  }
}
