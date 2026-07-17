import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { GiphySearchPage } from './giphySearch.service';

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
  deleteMany?(args: { where: { expiresAt: { lt: Date } } }): Promise<unknown>;
};

const EXPIRED_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
let lastExpiredCleanupAt = 0;

type CacheIdentity = {
  query: string;
  offset: number;
  limit: number;
};

function normalizedQuery(query: string): string {
  return query.trim().toLocaleLowerCase('en');
}

export function giphySearchCacheKey(identity: CacheIdentity): string {
  const query = normalizedQuery(identity.query);
  const scope = query
    ? `search:${createHash('sha256').update(query).digest('hex')}`
    : 'trending';
  return `giphy:list:v1:${scope}:offset:${identity.offset}:limit:${identity.limit}`;
}

export function giphySearchCacheTtlSeconds(query: string): number {
  return normalizedQuery(query)
    ? GIPHY_SEARCH_CACHE_TTL_SECONDS
    : GIPHY_TRENDING_CACHE_TTL_SECONDS;
}

function isCachedPage(value: unknown): value is GiphySearchPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<GiphySearchPage>;
  return (
    Array.isArray(page.items) &&
    typeof page.offset === 'number' &&
    typeof page.nextOffset === 'number' &&
    typeof page.limit === 'number' &&
    typeof page.totalCount === 'number' &&
    typeof page.hasMore === 'boolean'
  );
}

function resolveStore(
  store: GiphySearchCacheStore | null | undefined
): GiphySearchCacheStore | null {
  if (store !== undefined) return store;
  return (prisma as unknown as { giphySearchCache: GiphySearchCacheStore }).giphySearchCache;
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
  } catch {
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
    const response = page as unknown as Prisma.InputJsonValue;
    const expiresAt = new Date(
      Date.now() + giphySearchCacheTtlSeconds(identity.query) * 1_000
    );
    await cache.upsert({
      where: { key },
      create: { key, response, expiresAt },
      update: { response, expiresAt },
    });
    const now = Date.now();
    if (cache.deleteMany && now - lastExpiredCleanupAt >= EXPIRED_CLEANUP_INTERVAL_MS) {
      lastExpiredCleanupAt = now;
      await cache.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });
    }
  } catch {
    // Provider results still return when cache is unavailable.
  }
}
