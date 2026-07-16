import { ImageProcessor } from '../../utils/imageProcessor';
import { config } from '../../config/env';
import {
  buildGiphyCdnGifUrl,
  extractGiphyIdFromUrl,
  isDirectGiphyMediaUrl,
} from './giphyUrlDetect';
import {
  GIPHY_MAX_BYTES,
  SsrfFetchError,
  ssrfSafeFetchBytes,
  type DnsLookupFn,
} from './ssrfSafeFetch';
import {
  extensionForKind,
  GiphyValidateError,
  validateGiphyImageBuffer,
} from './giphyValidateImage';

export type GiphyIngestResult = {
  mediaUrl: string;
  thumbnailUrl: string;
};

export type GiphyIngestDeps = {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  processChatImage?: typeof ImageProcessor.processChatImage;
  apiKey?: string | null;
};

type GiphyApiGifResponse = {
  data?: {
    images?: {
      original?: { url?: string };
      downsized?: { url?: string };
    };
  };
};

async function resolveMediaUrlViaApi(
  gifId: string,
  apiKey: string,
  deps: GiphyIngestDeps
): Promise<string | null> {
  const apiUrl = `https://api.giphy.com/v1/gifs/${encodeURIComponent(gifId)}?api_key=${encodeURIComponent(apiKey)}`;
  try {
    const { buffer } = await ssrfSafeFetchBytes(apiUrl, {
      fetchFn: deps.fetchFn,
      lookupFn: deps.lookupFn,
      maxBytes: 512 * 1024,
      timeoutMs: 4_000,
    });
    const json = JSON.parse(buffer.toString('utf8')) as GiphyApiGifResponse;
    const original = json.data?.images?.original?.url?.trim();
    if (original && isDirectGiphyMediaUrl(original)) return original;
    const downsized = json.data?.images?.downsized?.url?.trim();
    if (downsized && isDirectGiphyMediaUrl(downsized)) return downsized;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve pasted Giphy URL → direct media download URL.
 * Happy path: direct media or CDN rewrite (1 hop). API only as fallback when key set + CDN fails later.
 */
export async function resolveGiphyMediaDownloadUrl(
  pastedUrl: string,
  _deps: GiphyIngestDeps = {}
): Promise<string | null> {
  if (isDirectGiphyMediaUrl(pastedUrl)) {
    return pastedUrl;
  }

  const gifId = extractGiphyIdFromUrl(pastedUrl);
  if (!gifId) return null;

  return buildGiphyCdnGifUrl(gifId);
}

/**
 * Fetch, validate, and re-host a Giphy media URL into chat originals storage.
 * Returns null on any soft-fail (caller keeps TEXT with original URL).
 */
export async function rehostGiphyMediaUrl(
  mediaDownloadUrl: string,
  deps: GiphyIngestDeps = {}
): Promise<GiphyIngestResult | null> {
  try {
    const { buffer } = await ssrfSafeFetchBytes(mediaDownloadUrl, {
      fetchFn: deps.fetchFn,
      lookupFn: deps.lookupFn,
      maxBytes: GIPHY_MAX_BYTES,
    });
    const { kind } = await validateGiphyImageBuffer(buffer);
    const processChatImage =
      deps.processChatImage ?? ImageProcessor.processChatImage.bind(ImageProcessor);
    const filename = `giphy${extensionForKind(kind)}`;
    const processed = await processChatImage(buffer, filename);
    if (!processed.originalPath || !processed.thumbnailPath) {
      return null;
    }
    if (/giphy\.com/i.test(processed.originalPath)) {
      return null;
    }
    return {
      mediaUrl: processed.originalPath,
      thumbnailUrl: processed.thumbnailPath,
    };
  } catch (err) {
    if (err instanceof SsrfFetchError || err instanceof GiphyValidateError) {
      return null;
    }
    console.warn('[giphyIngest] rehost failed', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Full paste → IMAGE pipeline. Soft-fails to null (message stays TEXT).
 * Fast path: CDN/direct media once. Optional API fallback only if rehost fails and key is set.
 */
export async function tryConvertGiphyPasteToImage(
  pastedUrl: string,
  deps: GiphyIngestDeps = {}
): Promise<GiphyIngestResult | null> {
  const primary = await resolveGiphyMediaDownloadUrl(pastedUrl, deps);
  if (!primary) return null;

  const first = await rehostGiphyMediaUrl(primary, deps);
  if (first) return first;

  const apiKey = (deps.apiKey !== undefined ? deps.apiKey : config.giphy.apiKey)?.trim() || '';
  const gifId = extractGiphyIdFromUrl(pastedUrl);
  if (!apiKey || !gifId) return null;

  const fromApi = await resolveMediaUrlViaApi(gifId, apiKey, deps);
  if (!fromApi || fromApi === primary) return null;
  return rehostGiphyMediaUrl(fromApi, deps);
}
