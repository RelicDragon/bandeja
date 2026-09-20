/**
 * PRD 350 — social proof on the Welcome step ("2,400 players in Belgrade").
 *
 * The count is a marketing number, not a permission decision, so a one-hour
 * per-node cache is plenty and keeps a cheap-looking endpoint from turning into
 * a `COUNT(*)` on every first-run app launch.
 */
import prisma from '../../config/database';

export const CITY_STATS_CACHE_TTL_MS = 60 * 60 * 1000;
/** Guards the cache against unbounded growth if a client walks every city id. */
export const CITY_STATS_CACHE_MAX_ENTRIES = 500;

export type CityStats = {
  cityId: string;
  playerCount: number;
};

type CacheEntry = { value: CityStats; expiresAt: number };

/**
 * Tiny TTL map. Exported so the unit test can drive it with an injected clock
 * instead of sleeping for an hour.
 */
export class CityStatsCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number = CITY_STATS_CACHE_TTL_MS,
    private readonly now: () => number = () => Date.now(),
    private readonly maxEntries: number = CITY_STATS_CACHE_MAX_ENTRIES,
  ) {}

  get(cityId: string): CityStats | undefined {
    const entry = this.entries.get(cityId);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(cityId);
      return undefined;
    }
    return entry.value;
  }

  set(cityId: string, value: CityStats): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(cityId)) {
      // Map iteration order is insertion order, so this drops the oldest key.
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(cityId, { value, expiresAt: this.now() + this.ttlMs });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const cache = new CityStatsCache();

export function invalidateCityStatsCache(): void {
  cache.clear();
}

export async function getCityStats(cityId: string): Promise<CityStats> {
  const cached = cache.get(cityId);
  if (cached) return cached;

  const playerCount = await prisma.user.count({
    where: { currentCityId: cityId, isActive: true },
  });

  const stats: CityStats = { cityId, playerCount };
  cache.set(cityId, stats);
  return stats;
}
