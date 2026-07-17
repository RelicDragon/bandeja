import { config } from '../../config/env';
import { isDirectGiphyMediaUrl } from './giphyUrlDetect';
import {
  SsrfFetchError,
  ssrfSafeFetchBytes,
  type DnsLookupFn,
} from './ssrfSafeFetch';
import {
  giphySearchCacheKey,
  readGiphySearchCacheForRequest,
  writeGiphySearchCache,
  type GiphySearchCacheStore,
} from './giphySearch.cache';
import { fetchKlipyGifs, isKlipySearchConfigured } from './klipySearch.service';
import {
  isGifProviderCoolingDown,
  recordGifProviderFailure,
  recordGifProviderSuccess,
} from './gifProviderHealth';

const inFlightGiphyLists = new Map<string, Promise<GiphySearchPage>>();

export const GIPHY_SEARCH_DEFAULT_LIMIT = 24;
export const GIPHY_SEARCH_MAX_LIMIT = 50;
export const GIF_SEARCH_PROVIDER_TIMEOUT_MS = 5_000;

export type GifProvider = 'GIPHY' | 'KLIPY';

export type GiphySearchItem = {
  provider: GifProvider;
  id: string;
  title: string;
  previewUrl: string;
  staticUrl?: string;
  downloadUrl: string;
  width: number;
  height: number;
};

export type GiphySearchPage = {
  provider: GifProvider;
  items: GiphySearchItem[];
  offset: number;
  /** Next active-provider offset (based on API page size, not filtered item count). */
  nextOffset: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
};

export type GiphySearchDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  apiKey?: string | null;
  klipyApiKey?: string | null;
  cache?: GiphySearchCacheStore | null;
  nowFn?: () => number;
  providerTimeoutMs?: number;
  authorizeCacheMiss?: () => Promise<boolean>;
};

export type GifSearchOptions = {
  offset?: number;
  limit?: number;
  provider?: GifProvider;
};

type GiphyApiImage = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyApiGif = {
  id?: string;
  title?: string;
  images?: {
    original?: GiphyApiImage;
    downsized?: GiphyApiImage;
    downsized_medium?: GiphyApiImage;
    fixed_width?: GiphyApiImage;
    fixed_width_still?: GiphyApiImage;
    fixed_width_downsampled?: GiphyApiImage;
    preview_gif?: GiphyApiImage;
  };
};

type GiphyApiListResponse = {
  data?: GiphyApiGif[];
  meta?: {
    status?: number;
  };
  pagination?: {
    total_count?: number;
    count?: number;
    offset?: number;
  };
};

export function isGiphySearchConfigured(apiKey?: string | null): boolean {
  const key = (apiKey !== undefined ? apiKey : config.giphy.apiKey)?.trim() || '';
  return key.length > 0;
}

export function isGifSearchConfigured(deps: {
  giphyApiKey?: string | null;
  klipyApiKey?: string | null;
} = {}): boolean {
  const giphyKey =
    deps.giphyApiKey !== undefined ? deps.giphyApiKey : config.giphy.apiKey;
  const klipyKey =
    deps.klipyApiKey !== undefined ? deps.klipyApiKey : config.klipy.apiKey;
  return isGiphySearchConfigured(giphyKey) || isKlipySearchConfigured(klipyKey);
}

function clampLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return GIPHY_SEARCH_DEFAULT_LIMIT;
  return Math.min(GIPHY_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(raw)));
}

function clampOffset(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

function normalizeGiphyMediaUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }
  if (parsed.protocol !== 'https:') return null;
  const normalized = parsed.toString();
  return isDirectGiphyMediaUrl(normalized) ? normalized : null;
}

function pickPreviewUrl(images: GiphyApiGif['images']): string | null {
  if (!images) return null;
  const candidates = [
    images.fixed_width_downsampled?.url,
    images.fixed_width?.url,
    images.preview_gif?.url,
    images.downsized?.url,
  ];
  for (const url of candidates) {
    if (!url) continue;
    const normalized = normalizeGiphyMediaUrl(url);
    if (normalized) return normalized;
  }
  return null;
}

function pickDownloadUrl(images: GiphyApiGif['images']): string | null {
  if (!images) return null;
  // Prefer smaller re-host targets for speed; original only as last resort.
  const candidates = [
    images.downsized_medium?.url,
    images.downsized?.url,
    images.fixed_width?.url,
    images.original?.url,
  ];
  for (const url of candidates) {
    if (!url) continue;
    const normalized = normalizeGiphyMediaUrl(url);
    if (normalized) return normalized;
  }
  return null;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(8192, n) : fallback;
}

function mapGif(gif: GiphyApiGif): GiphySearchItem | null {
  const id = gif.id?.trim();
  if (!id || id.length > 100) return null;
  const previewUrl = pickPreviewUrl(gif.images);
  const downloadUrl = pickDownloadUrl(gif.images);
  if (!previewUrl || !downloadUrl) return null;
  const dims =
    gif.images?.fixed_width ??
    gif.images?.downsized ??
    gif.images?.original ??
    gif.images?.fixed_width_downsampled;
  const staticUrl = gif.images?.fixed_width_still?.url
    ? normalizeGiphyMediaUrl(gif.images.fixed_width_still.url)
    : null;
  return {
    provider: 'GIPHY',
    id,
    title: ((gif.title ?? '').trim() || 'GIF').slice(0, 200),
    previewUrl,
    ...(staticUrl ? { staticUrl } : {}),
    downloadUrl,
    width: parsePositiveInt(dims?.width, 200),
    height: parsePositiveInt(dims?.height, 200),
  };
}

async function fetchGiphyList(
  pathAndQuery: string,
  requestedLimit: number,
  deps: GiphySearchDeps
): Promise<GiphySearchPage> {
  const apiKey = (deps.apiKey !== undefined ? deps.apiKey : config.giphy.apiKey)?.trim() || '';
  if (!apiKey) {
    throw new Error('GIPHY_API_KEY_MISSING');
  }

  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `https://api.giphy.com${pathAndQuery}${sep}api_key=${encodeURIComponent(apiKey)}`;

  const { buffer } = await ssrfSafeFetchBytes(url, {
    fetchFn: deps.fetchFn,
    lookupFn: deps.lookupFn,
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: deps.providerTimeoutMs ?? GIF_SEARCH_PROVIDER_TIMEOUT_MS,
  });

  const json = JSON.parse(buffer.toString('utf8')) as GiphyApiListResponse;
  if (!Array.isArray(json.data) || (json.meta?.status != null && json.meta.status !== 200)) {
    throw new Error('GIPHY_SEARCH_FAILED');
  }
  const rawCount = Math.min(json.data.length, requestedLimit);
  const items = json.data
    .slice(0, requestedLimit)
    .map(mapGif)
    .filter((item): item is GiphySearchItem => item != null);

  const offset = json.pagination?.offset ?? 0;
  const pageCount = Math.min(json.pagination?.count ?? rawCount, requestedLimit);
  const totalCount = json.pagination?.total_count ?? offset + pageCount;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(pageCount) ||
    pageCount < 0 ||
    !Number.isSafeInteger(totalCount) ||
    totalCount < offset + pageCount
  ) {
    throw new Error('GIPHY_SEARCH_FAILED');
  }
  const providerNextOffset = offset + pageCount;
  const hasMore = pageCount > 0 && providerNextOffset < totalCount;
  const nextOffset = hasMore ? offset + requestedLimit : providerNextOffset;

  return {
    provider: 'GIPHY',
    items,
    offset,
    nextOffset,
    limit: pageCount,
    totalCount,
    hasMore,
  };
}

function configuredProviders(deps: GiphySearchDeps): GifProvider[] {
  const giphyApiKey =
    deps.apiKey !== undefined ? deps.apiKey : config.giphy.apiKey;
  const klipyApiKey =
    deps.klipyApiKey !== undefined ? deps.klipyApiKey : config.klipy.apiKey;
  const providers: GifProvider[] = [];
  if (isGiphySearchConfigured(giphyApiKey)) providers.push('GIPHY');
  if (isKlipySearchConfigured(klipyApiKey)) providers.push('KLIPY');
  return providers;
}

function providerOrder(
  preferredProvider: GifProvider | undefined,
  deps: GiphySearchDeps
): GifProvider[] {
  const configured = configuredProviders(deps);
  const base: GifProvider[] = preferredProvider
    ? [preferredProvider, preferredProvider === 'GIPHY' ? 'KLIPY' : 'GIPHY']
    : ['GIPHY', 'KLIPY'];
  const available = base.filter((provider) => configured.includes(provider));
  const now = deps.nowFn?.() ?? Date.now();
  return available.filter((provider) => !isGifProviderCoolingDown(provider, now));
}

function giphyPath(query: string, offset: number, limit: number): string {
  return query
    ? `/v1/gifs/search?q=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&rating=pg-13&lang=en`
    : `/v1/gifs/trending?offset=${offset}&limit=${limit}&rating=pg-13`;
}

async function fetchGifListWithFallback(
  query: string,
  offset: number,
  limit: number,
  preferredProvider: GifProvider | undefined,
  deps: GiphySearchDeps
): Promise<GiphySearchPage> {
  const providers = providerOrder(preferredProvider, deps);
  if (providers.length === 0) {
    if (configuredProviders(deps).length === 0) {
      throw new Error('GIF_SEARCH_NOT_CONFIGURED');
    }
    throw new Error('GIF_SEARCH_PROVIDERS_COOLING_DOWN');
  }
  const now = deps.nowFn?.() ?? Date.now();
  for (const provider of providers) {
    const attemptOffset = offset;
    try {
      const page =
        provider === 'GIPHY'
          ? await fetchGiphyList(giphyPath(query, attemptOffset, limit), limit, deps)
          : await fetchKlipyGifs(
              query,
              { offset: attemptOffset, limit },
              {
                fetchFn: deps.fetchFn,
                lookupFn: deps.lookupFn,
                apiKey:
                  deps.klipyApiKey !== undefined
                    ? deps.klipyApiKey
                    : config.klipy.apiKey,
                timeoutMs:
                  deps.providerTimeoutMs ?? GIF_SEARCH_PROVIDER_TIMEOUT_MS,
              }
            );
      recordGifProviderSuccess(provider);
      return page;
    } catch {
      recordGifProviderFailure(provider, now);
    }
  }
  throw new Error('GIF_SEARCH_FAILED');
}

function cacheStoreForDeps(
  deps: GiphySearchDeps
): GiphySearchCacheStore | null | undefined {
  if (deps.cache !== undefined) return deps.cache;
  return deps.fetchFn || deps.lookupFn ? null : undefined;
}

async function cachedGiphyList(
  query: string,
  offset: number,
  limit: number,
  provider: GifProvider | undefined,
  fetchPage: () => Promise<GiphySearchPage>,
  deps: GiphySearchDeps
): Promise<GiphySearchPage> {
  const identity = { query, offset, limit, provider };
  const cache = cacheStoreForDeps(deps);
  const eligible = providerOrder(provider, deps);
  const cached = await readGiphySearchCacheForRequest(identity, eligible, cache);
  if (cached) return cached;
  // Coalesce in-flight by request identity (preferred provider), not response provider.
  const inflightKey = `req:${giphySearchCacheKey({
    ...identity,
    provider: provider ?? 'GIPHY',
  })}:${provider ?? 'AUTO'}`;
  const existing = inFlightGiphyLists.get(inflightKey);
  if (existing) return existing;

  const request = (async () => {
    if (deps.authorizeCacheMiss && !(await deps.authorizeCacheMiss())) {
      throw new Error('GIF_SEARCH_RATE_LIMITED');
    }
    const page = await fetchPage();
    // Persist under the provider that actually answered — never under a preferred
    // key that fell back (avoids locking Giphy requests onto Klipy for months).
    await writeGiphySearchCache(
      { query, offset, limit, provider: page.provider },
      page,
      cache
    );
    return page;
  })();
  inFlightGiphyLists.set(inflightKey, request);
  try {
    return await request;
  } finally {
    if (inFlightGiphyLists.get(inflightKey) === request) {
      inFlightGiphyLists.delete(inflightKey);
    }
  }
}

export async function searchGiphyGifs(
  query: string,
  options: GifSearchOptions = {},
  deps: GiphySearchDeps = {}
): Promise<GiphySearchPage> {
  const q = query.trim();
  if (!q) {
    return trendingGiphyGifs(options, deps);
  }
  const offset = clampOffset(options.offset);
  const limit = clampLimit(options.limit);
  try {
    return await cachedGiphyList(
      q,
      offset,
      limit,
      options.provider,
      () =>
        fetchGifListWithFallback(
          q,
          offset,
          limit,
          options.provider,
          deps
        ),
      deps
    );
  } catch (err) {
    if (err instanceof SsrfFetchError) throw err;
    if (
      err instanceof Error &&
      (err.message === 'GIF_SEARCH_NOT_CONFIGURED' ||
        err.message === 'GIF_SEARCH_RATE_LIMITED' ||
        err.message === 'GIF_SEARCH_PROVIDERS_COOLING_DOWN')
    ) {
      throw err;
    }
    throw new Error('GIPHY_SEARCH_FAILED');
  }
}

export async function trendingGiphyGifs(
  options: GifSearchOptions = {},
  deps: GiphySearchDeps = {}
): Promise<GiphySearchPage> {
  const offset = clampOffset(options.offset);
  const limit = clampLimit(options.limit);
  try {
    return await cachedGiphyList(
      '',
      offset,
      limit,
      options.provider,
      () =>
        fetchGifListWithFallback(
          '',
          offset,
          limit,
          options.provider,
          deps
        ),
      deps
    );
  } catch (err) {
    if (err instanceof SsrfFetchError) throw err;
    if (
      err instanceof Error &&
      (err.message === 'GIF_SEARCH_NOT_CONFIGURED' ||
        err.message === 'GIF_SEARCH_RATE_LIMITED' ||
        err.message === 'GIF_SEARCH_PROVIDERS_COOLING_DOWN')
    ) {
      throw err;
    }
    throw new Error('GIPHY_SEARCH_FAILED');
  }
}
