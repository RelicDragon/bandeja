import { parseOgMeta } from './parseOgMeta';
import { isSkippedLinkPreviewHost } from './linkPreviewHosts';
import {
  assertPublicHttpsUrl,
  LINK_PREVIEW_FETCH_TIMEOUT_MS,
  ssrfSafePublicFetchBytes,
  SsrfFetchError,
} from './ssrfSafePublicFetch';
import { isBlockedIpAddress } from '../giphyIngest/ssrfSafeFetch';

export type LinkPreviewResult = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  hostname: string;
};

type CacheEntry = {
  at: number;
  value: LinkPreviewResult | null;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 400;

const cache = new Map<string, CacheEntry>();

export function resetLinkPreviewCacheForTests(): void {
  cache.clear();
}

function cacheGet(key: string): LinkPreviewResult | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  const ttl = entry.value ? CACHE_TTL_MS : CACHE_NEGATIVE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: LinkPreviewResult | null): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

function normalizePreviewUrl(urlString: string): string {
  const u = assertPublicHttpsUrl(urlString);
  u.hash = '';
  return u.toString();
}

function hostnameFromUrl(urlString: string): string {
  try {
    return new URL(urlString).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function isSafeHttpsImageUrl(urlString: string | null): string | null {
  if (!urlString) return null;
  try {
    const u = assertPublicHttpsUrl(urlString);
    if (netIsIpLiteral(u.hostname) && isBlockedIpAddress(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function netIsIpLiteral(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':');
}

/**
 * Unfurl HTTPS page OG/meta. Returns null on skip/timeout/error (soft fail).
 */
export async function fetchLinkPreview(
  urlString: string,
  options?: { fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  let normalized: string;
  try {
    normalized = normalizePreviewUrl(urlString);
  } catch {
    return null;
  }

  const host = new URL(normalized).hostname;
  if (isSkippedLinkPreviewHost(host)) return null;

  const cached = cacheGet(normalized);
  if (cached !== undefined) return cached;

  try {
    const { buffer, finalUrl, contentType } = await ssrfSafePublicFetchBytes(normalized, {
      timeoutMs: LINK_PREVIEW_FETCH_TIMEOUT_MS,
      fetchFn: options?.fetchFn,
    });

    if (isSkippedLinkPreviewHost(new URL(finalUrl).hostname)) {
      cacheSet(normalized, null);
      return null;
    }

    const ct = (contentType ?? '').toLowerCase();
    if (ct && !ct.includes('text/html') && !ct.includes('application/xhtml')) {
      cacheSet(normalized, null);
      return null;
    }

    const html = buffer.toString('utf8');
    const meta = parseOgMeta(html, finalUrl);
    if (!meta.title && !meta.description && !meta.imageUrl) {
      cacheSet(normalized, null);
      return null;
    }

    const result: LinkPreviewResult = {
      url: normalized,
      finalUrl,
      title: meta.title,
      description: meta.description,
      imageUrl: isSafeHttpsImageUrl(meta.imageUrl),
      siteName: meta.siteName,
      hostname: hostnameFromUrl(finalUrl),
    };
    cacheSet(normalized, result);
    return result;
  } catch (err) {
    if (!(err instanceof SsrfFetchError)) {
      console.warn('[linkPreview] unexpected', err instanceof Error ? err.message : err);
    }
    cacheSet(normalized, null);
    return null;
  }
}
