import { config } from '../../config/env';
import { isDirectGiphyMediaUrl } from './giphyUrlDetect';
import {
  SsrfFetchError,
  ssrfSafeFetchBytes,
  type DnsLookupFn,
} from './ssrfSafeFetch';
import {
  readGiphySearchCache,
  writeGiphySearchCache,
  type GiphySearchCacheStore,
} from './giphySearch.cache';

export const GIPHY_SEARCH_DEFAULT_LIMIT = 24;
export const GIPHY_SEARCH_MAX_LIMIT = 50;

export type GiphySearchItem = {
  id: string;
  title: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
};

export type GiphySearchPage = {
  items: GiphySearchItem[];
  offset: number;
  /** Next Giphy API offset (based on API page size, not filtered item count). */
  nextOffset: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
};

export type GiphySearchDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  apiKey?: string | null;
  cache?: GiphySearchCacheStore | null;
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
    fixed_width_downsampled?: GiphyApiImage;
    preview_gif?: GiphyApiImage;
  };
};

type GiphyApiListResponse = {
  data?: GiphyApiGif[];
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
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function mapGif(gif: GiphyApiGif): GiphySearchItem | null {
  const id = gif.id?.trim();
  if (!id) return null;
  const previewUrl = pickPreviewUrl(gif.images);
  const downloadUrl = pickDownloadUrl(gif.images);
  if (!previewUrl || !downloadUrl) return null;
  const dims =
    gif.images?.fixed_width ??
    gif.images?.downsized ??
    gif.images?.original ??
    gif.images?.fixed_width_downsampled;
  return {
    id,
    title: (gif.title ?? '').trim() || 'GIF',
    previewUrl,
    downloadUrl,
    width: parsePositiveInt(dims?.width, 200),
    height: parsePositiveInt(dims?.height, 200),
  };
}

async function fetchGiphyList(
  pathAndQuery: string,
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
    timeoutMs: 8_000,
  });

  const json = JSON.parse(buffer.toString('utf8')) as GiphyApiListResponse;
  const rawCount = Array.isArray(json.data) ? json.data.length : 0;
  const items = (json.data ?? [])
    .map(mapGif)
    .filter((item): item is GiphySearchItem => item != null);

  const offset = json.pagination?.offset ?? 0;
  const pageCount = json.pagination?.count ?? rawCount;
  const totalCount = json.pagination?.total_count ?? offset + pageCount;
  const nextOffset = offset + pageCount;
  const hasMore = nextOffset < totalCount;

  return { items, offset, nextOffset, limit: pageCount, totalCount, hasMore };
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
  fetchPage: () => Promise<GiphySearchPage>,
  deps: GiphySearchDeps
): Promise<GiphySearchPage> {
  const identity = { query, offset, limit };
  const cache = cacheStoreForDeps(deps);
  const cached = await readGiphySearchCache(identity, cache);
  if (cached) return cached;
  const page = await fetchPage();
  await writeGiphySearchCache(identity, page, cache);
  return page;
}

export async function searchGiphyGifs(
  query: string,
  options: { offset?: number; limit?: number } = {},
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
      () =>
        fetchGiphyList(
          `/v1/gifs/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}&rating=pg-13&lang=en`,
          deps
        ),
      deps
    );
  } catch (err) {
    if (err instanceof SsrfFetchError) throw err;
    if (err instanceof Error && err.message === 'GIPHY_API_KEY_MISSING') throw err;
    throw new Error('GIPHY_SEARCH_FAILED');
  }
}

export async function trendingGiphyGifs(
  options: { offset?: number; limit?: number } = {},
  deps: GiphySearchDeps = {}
): Promise<GiphySearchPage> {
  const offset = clampOffset(options.offset);
  const limit = clampLimit(options.limit);
  try {
    return await cachedGiphyList(
      '',
      offset,
      limit,
      () =>
        fetchGiphyList(
          `/v1/gifs/trending?offset=${offset}&limit=${limit}&rating=pg-13`,
          deps
        ),
      deps
    );
  } catch (err) {
    if (err instanceof SsrfFetchError) throw err;
    if (err instanceof Error && err.message === 'GIPHY_API_KEY_MISSING') throw err;
    throw new Error('GIPHY_SEARCH_FAILED');
  }
}
