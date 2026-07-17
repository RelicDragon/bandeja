import { config } from '../../config/env';
import { isDirectKlipyMediaUrl } from './giphyHosts';
import { ssrfSafeFetchBytes, type DnsLookupFn } from './ssrfSafeFetch';
import type { GiphySearchItem, GiphySearchPage } from './giphySearch.service';

type KlipyMedia = {
  url?: string;
  width?: number;
  height?: number;
};

type KlipyGif = {
  id?: string | number;
  slug?: string;
  title?: string;
  type?: string;
  file?: Partial<Record<'hd' | 'md' | 'sm' | 'xs', { gif?: KlipyMedia }>>;
};

type KlipyResponse = {
  result?: boolean;
  data?: {
    data?: KlipyGif[];
    current_page?: number;
    per_page?: number;
    has_next?: boolean;
    total?: number;
  };
};

export type KlipySearchDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  apiKey?: string | null;
  timeoutMs?: number;
};

function normalizeMedia(media: KlipyMedia | undefined): KlipyMedia | null {
  const rawUrl = media?.url?.trim();
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (!isDirectKlipyMediaUrl(url.toString())) return null;
  return {
    url: url.toString(),
    width:
      typeof media?.width === 'number' && Number.isFinite(media.width) && media.width > 0
        ? Math.floor(media.width)
        : undefined,
    height:
      typeof media?.height === 'number' && Number.isFinite(media.height) && media.height > 0
        ? Math.floor(media.height)
        : undefined,
  };
}

function firstMedia(candidates: Array<KlipyMedia | undefined>): KlipyMedia | null {
  for (const candidate of candidates) {
    const media = normalizeMedia(candidate);
    if (media) return media;
  }
  return null;
}

function mapKlipyGif(gif: KlipyGif): GiphySearchItem | null {
  if (gif.type === 'ad') return null;
  const id = String(gif.slug ?? gif.id ?? '').trim();
  if (!id || id.length > 100) return null;
  const preview = firstMedia([
    gif.file?.sm?.gif,
    gif.file?.xs?.gif,
    gif.file?.md?.gif,
    gif.file?.hd?.gif,
  ]);
  const download = firstMedia([
    gif.file?.md?.gif,
    gif.file?.hd?.gif,
    gif.file?.sm?.gif,
    gif.file?.xs?.gif,
  ]);
  if (!preview?.url || !download?.url) return null;
  return {
    provider: 'KLIPY',
    id,
    title: (gif.title?.trim() || 'GIF').slice(0, 200),
    previewUrl: preview.url,
    downloadUrl: download.url,
    width: Math.min(8192, preview.width ?? download.width ?? 200),
    height: Math.min(8192, preview.height ?? download.height ?? 200),
  };
}

export function isKlipySearchConfigured(apiKey?: string | null): boolean {
  const key = (apiKey !== undefined ? apiKey : config.klipy.apiKey)?.trim() || '';
  return key.length > 0;
}

export async function fetchKlipyGifs(
  query: string,
  options: { offset: number; limit: number },
  deps: KlipySearchDeps = {}
): Promise<GiphySearchPage> {
  const apiKey = (deps.apiKey !== undefined ? deps.apiKey : config.klipy.apiKey)?.trim() || '';
  if (!apiKey) throw new Error('KLIPY_API_KEY_MISSING');

  const page = Math.floor(options.offset / options.limit) + 1;
  const path = query.trim() ? 'search' : 'trending';
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(options.limit),
    locale: 'en_US',
    content_filter: 'medium',
    format_filter: 'gif',
  });
  if (query.trim()) params.set('q', query.trim());
  const url = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/${path}?${params}`;
  const { buffer } = await ssrfSafeFetchBytes(url, {
    fetchFn: deps.fetchFn,
    lookupFn: deps.lookupFn,
    maxBytes: 2 * 1024 * 1024,
    timeoutMs: deps.timeoutMs ?? 5_000,
  });
  const json = JSON.parse(buffer.toString('utf8')) as KlipyResponse;
  if (json.result === false || !Array.isArray(json.data?.data)) {
    throw new Error('KLIPY_SEARCH_FAILED');
  }
  if (
    (json.data.current_page != null && json.data.current_page !== page) ||
    (json.data.per_page != null &&
      (!Number.isSafeInteger(json.data.per_page) || json.data.per_page < 1))
  ) {
    throw new Error('KLIPY_SEARCH_FAILED');
  }
  const rawItems = json.data.data.slice(0, options.limit);
  const items = rawItems.map(mapKlipyGif).filter((item): item is GiphySearchItem => item != null);
  const nextOffset = page * options.limit;
  const hasMore = rawItems.length > 0 && json.data.has_next === true;
  if (
    json.data.total != null &&
    (!Number.isSafeInteger(json.data.total) || json.data.total < 0)
  ) {
    throw new Error('KLIPY_SEARCH_FAILED');
  }
  const totalCount =
    typeof json.data.total === 'number'
      ? json.data.total
      : hasMore
        ? nextOffset + 1
        : nextOffset;
  return {
    provider: 'KLIPY',
    items,
    offset: options.offset,
    nextOffset,
    limit: rawItems.length,
    totalCount,
    hasMore,
  };
}
