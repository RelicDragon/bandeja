import { config } from '../../config/env';
import { isDirectKlipyMediaUrl, isKlipyPageHost } from './giphyHosts';
import { ssrfSafeFetchBytes, type DnsLookupFn } from './ssrfSafeFetch';

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const PAGE_PATH_RE =
  /^\/(?:gifs|stickers|clips|ai-gifs|static-memes)\/([^/?#]+)\/?$/i;

type KlipyMedia = {
  url?: string;
  width?: number;
  height?: number;
};

type KlipyGif = {
  slug?: string;
  type?: string;
  file?: Partial<Record<'hd' | 'md' | 'sm' | 'xs', { gif?: KlipyMedia }>>;
};

type KlipyItemsResponse = {
  result?: boolean;
  data?: {
    data?: KlipyGif[];
  };
};

export type KlipyResolveDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  apiKey?: string | null;
};

/**
 * Extract Klipy share-page slug (`/gifs/{slug}`, `/stickers/{slug}`, …).
 */
export function extractKlipySlugFromUrl(urlString: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  if (!isKlipyPageHost(parsed.hostname)) return null;

  const match = PAGE_PATH_RE.exec(parsed.pathname);
  if (!match?.[1]) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[1]).trim();
  } catch {
    return null;
  }
  return SLUG_RE.test(slug) ? slug : null;
}

function firstDirectGifUrl(gif: KlipyGif): string | null {
  const candidates = [
    gif.file?.md?.gif?.url,
    gif.file?.hd?.gif?.url,
    gif.file?.sm?.gif?.url,
    gif.file?.xs?.gif?.url,
  ];
  for (const raw of candidates) {
    const url = raw?.trim();
    if (!url) continue;
    try {
      const normalized = new URL(url);
      if (normalized.protocol === 'http:') normalized.protocol = 'https:';
      const href = normalized.toString();
      if (isDirectKlipyMediaUrl(href)) return href;
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolve Klipy share page → direct static CDN GIF URL via Items API. */
export async function resolveKlipyPageMediaUrl(
  pastedUrl: string,
  deps: KlipyResolveDeps = {}
): Promise<string | null> {
  const slug = extractKlipySlugFromUrl(pastedUrl);
  if (!slug) return null;

  const apiKey = (deps.apiKey !== undefined ? deps.apiKey : config.klipy.apiKey)?.trim() || '';
  if (!apiKey) return null;

  const apiUrl = `https://api.klipy.com/api/v1/${encodeURIComponent(apiKey)}/gifs/items?slugs=${encodeURIComponent(slug)}`;
  try {
    const { buffer } = await ssrfSafeFetchBytes(apiUrl, {
      fetchFn: deps.fetchFn,
      lookupFn: deps.lookupFn,
      maxBytes: 512 * 1024,
      timeoutMs: 4_000,
    });
    const json = JSON.parse(buffer.toString('utf8')) as KlipyItemsResponse;
    if (json.result === false || !Array.isArray(json.data?.data)) return null;
    for (const gif of json.data.data) {
      if (gif.type === 'ad') continue;
      const media = firstDirectGifUrl(gif);
      if (media) return media;
    }
    return null;
  } catch {
    return null;
  }
}
