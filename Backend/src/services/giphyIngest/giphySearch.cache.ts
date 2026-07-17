import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { GiphySearchPage } from './giphySearch.service';
import { isDirectKlipyMediaUrl } from './giphyHosts';
import { isDirectGiphyMediaUrl } from './giphyUrlDetect';

export const GIPHY_TRENDING_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const GIPHY_SEARCH_CACHE_TTL_SECONDS = 180 * 24 * 60 * 60;

export type GiphySearchCacheStore = {
  findUnique(args: {
    where: { key: string };
  }): Promise<{ response: unknown; expiresAt: Date } | null>;
  upsert(args: {
    where: { key: string };
    create: { key: string; response: Prisma.InputJsonValue; expiresAt: Date };
    update: { response: Prisma.InputJsonValue; expiresAt: Date };
  }): Promise<unknown>;
  deleteMany?(args: {
    where: { expiresAt: { lt: Date } } | { key: { in: string[] } };
  }): Promise<unknown>;
  count?(): Promise<number>;
  findMany?(args: {
    select: { key: true };
    orderBy: { updatedAt: 'asc' };
    take: number;
  }): Promise<Array<{ key: string }>>;
};

const EXPIRED_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const CACHE_BUDGET_CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
export const GIF_SEARCH_CACHE_MAX_ROWS = 100_000;
const GIF_SEARCH_CACHE_TARGET_ROWS = 90_000;
let lastExpiredCleanupAt = 0;
let lastBudgetCleanupAt = 0;
let lastCacheErrorLogAt = 0;

type CacheIdentity = {
  query: string;
  offset: number;
  limit: number;
  provider?: 'GIPHY' | 'KLIPY';
};

function reportCacheFailure(operation: string, error: unknown): void {
  const now = Date.now();
  if (now - lastCacheErrorLogAt < 60_000) return;
  lastCacheErrorLogAt = now;
  console.warn(
    `[gif-cache] ${operation} failed`,
    error instanceof Error ? error.message : error
  );
}

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase('en');
}

export function giphySearchCacheKey(identity: CacheIdentity): string {
  const query = normalizedQuery(identity.query);
  const scope = query
    ? `search:${createHash('sha256').update(query).digest('hex')}`
    : 'trending';
  // Always provider-scoped (GIPHY|KLIPY). AUTO keys are retired — fallbacks must not
  // poison a preferred-provider entry for the long search TTL.
  const provider = identity.provider ?? 'GIPHY';
  return `gif:list:v4:${provider}:${scope}:offset:${identity.offset}:limit:${identity.limit}`;
}

/**
 * Read cache for a search request.
 * - Preferred provider: only that provider's own entry (stale-OK during cooldown).
 * - AUTO: only the first eligible provider's entry, so a prior Klipy fallback cannot
 *   shadow Giphy after it recovers from cooldown.
 */
export async function readGiphySearchCacheForRequest(
  identity: CacheIdentity,
  eligibleProviders: Array<'GIPHY' | 'KLIPY'>,
  store?: GiphySearchCacheStore | null
): Promise<GiphySearchPage | null> {
  if (identity.provider) {
    return readGiphySearchCache(identity, store);
  }
  const primary = eligibleProviders[0];
  if (primary) {
    return readGiphySearchCache({ ...identity, provider: primary }, store);
  }
  // All providers cooling/unconfigured: serve any cached page rather than hard-fail.
  return (
    (await readGiphySearchCache({ ...identity, provider: 'GIPHY' }, store)) ??
    (await readGiphySearchCache({ ...identity, provider: 'KLIPY' }, store))
  );
}

export function giphySearchCacheTtlSeconds(query: string): number {
  return normalizedQuery(query)
    ? GIPHY_SEARCH_CACHE_TTL_SECONDS
    : GIPHY_TRENDING_CACHE_TTL_SECONDS;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isCachedPage(value: unknown): value is GiphySearchPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<GiphySearchPage>;
  return (
    (page.provider === 'GIPHY' || page.provider === 'KLIPY') &&
    Array.isArray(page.items) &&
    page.items.length <= 50 &&
    page.items.every((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        (item.provider !== 'GIPHY' && item.provider !== 'KLIPY') ||
        typeof item.id !== 'string' ||
        item.id.length === 0 ||
        item.id.length > 100 ||
        typeof item.title !== 'string' ||
        item.title.length > 200 ||
        typeof item.previewUrl !== 'string' ||
        (item.staticUrl != null && typeof item.staticUrl !== 'string') ||
        typeof item.downloadUrl !== 'string' ||
        typeof item.width !== 'number' ||
        !Number.isFinite(item.width) ||
        item.width < 1 ||
        item.width > 8192 ||
        typeof item.height !== 'number' ||
        !Number.isFinite(item.height) ||
        item.height < 1 ||
        item.height > 8192
      ) {
        return false;
      }
      const validateUrl =
        item.provider === 'GIPHY' ? isDirectGiphyMediaUrl : isDirectKlipyMediaUrl;
      return (
        validateUrl(item.previewUrl) &&
        validateUrl(item.downloadUrl) &&
        (item.staticUrl == null || validateUrl(item.staticUrl))
      );
    }) &&
    isIntegerInRange(page.offset, 0, 1_000_000_000) &&
    isIntegerInRange(page.nextOffset, page.offset, 1_000_000_000) &&
    isIntegerInRange(page.limit, 0, 50) &&
    isIntegerInRange(page.totalCount, 0, 1_000_000_000) &&
    typeof page.hasMore === 'boolean'
  );
}

function serializePage(page: GiphySearchPage): Prisma.InputJsonObject {
  const items: Prisma.InputJsonObject[] = page.items.map((item) => ({
    provider: item.provider,
    id: item.id,
    title: item.title,
    previewUrl: item.previewUrl,
    ...(item.staticUrl ? { staticUrl: item.staticUrl } : {}),
    downloadUrl: item.downloadUrl,
    width: item.width,
    height: item.height,
  }));
  return {
    provider: page.provider,
    items,
    offset: page.offset,
    nextOffset: page.nextOffset,
    limit: page.limit,
    totalCount: page.totalCount,
    hasMore: page.hasMore,
  };
}

function resolveStore(
  store: GiphySearchCacheStore | null | undefined
): GiphySearchCacheStore | null {
  if (store !== undefined) return store;
  return prisma.giphySearchCache;
}

function scheduleExpiredCleanup(cache: GiphySearchCacheStore): void {
  if (!cache.deleteMany) return;
  const now = Date.now();
  if (now - lastExpiredCleanupAt < EXPIRED_CLEANUP_INTERVAL_MS) return;
  lastExpiredCleanupAt = now;
  void cache
    .deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
    .catch((error) => {
      lastExpiredCleanupAt = 0;
      reportCacheFailure('cleanup', error);
    });
}

function scheduleCacheBudgetCleanup(cache: GiphySearchCacheStore): void {
  if (!cache.count || !cache.findMany || !cache.deleteMany) return;
  const now = Date.now();
  if (now - lastBudgetCleanupAt < CACHE_BUDGET_CLEANUP_INTERVAL_MS) return;
  lastBudgetCleanupAt = now;
  void (async () => {
    const count = await cache.count!();
    if (count <= GIF_SEARCH_CACHE_MAX_ROWS) return;
    const rows = await cache.findMany!({
      select: { key: true },
      orderBy: { updatedAt: 'asc' },
      take: count - GIF_SEARCH_CACHE_TARGET_ROWS,
    });
    if (rows.length > 0) {
      await cache.deleteMany!({
        where: { key: { in: rows.map((row) => row.key) } },
      });
    }
  })().catch((error) => {
    lastBudgetCleanupAt = 0;
    reportCacheFailure('budget cleanup', error);
  });
}

export async function readGiphySearchCache(
  identity: CacheIdentity,
  store?: GiphySearchCacheStore | null
): Promise<GiphySearchPage | null> {
  try {
    const cache = resolveStore(store);
    if (!cache) return null;
    const hit = await cache.findUnique({
      where: { key: giphySearchCacheKey(identity) },
    });
    if (!hit || hit.expiresAt.getTime() <= Date.now()) return null;
    return isCachedPage(hit.response) ? hit.response : null;
  } catch (error) {
    reportCacheFailure('read', error);
    return null;
  }
}

export async function writeGiphySearchCache(
  identity: CacheIdentity,
  page: GiphySearchPage,
  store?: GiphySearchCacheStore | null
): Promise<void> {
  try {
    const cache = resolveStore(store);
    if (!cache) return;
    const key = giphySearchCacheKey(identity);
    const response = serializePage(page);
    const expiresAt = new Date(
      Date.now() + giphySearchCacheTtlSeconds(identity.query) * 1_000
    );
    await cache.upsert({
      where: { key },
      create: { key, response, expiresAt },
      update: { response, expiresAt },
    });
    scheduleExpiredCleanup(cache);
    scheduleCacheBudgetCleanup(cache);
  } catch (error) {
    reportCacheFailure('write', error);
    // Provider results still return when cache is unavailable.
  }
}
