import { parseOgMeta } from './parseOgMeta';
import { isSkippedLinkPreviewHost } from './linkPreviewHosts';
import {
  assertPublicHttpsUrl,
  LINK_PREVIEW_FETCH_TIMEOUT_MS,
  ssrfSafePublicFetchBytes,
  SsrfFetchError,
} from './ssrfSafePublicFetch';
import { isBlockedIpAddress } from '../giphyIngest/ssrfSafeFetch';
import { parseBandejaLink } from './parseBandejaLink';
import {
  canViewBandejaLinkPreview,
  fetchBandejaLinkPreview,
} from './bandejaLinkPreview.service';
import { fetchYoutubeLinkPreview, parseYoutubeVideoId } from './youtubeLinkPreview';
import { buildProxiedImagePath } from './linkPreviewImageProxy';
import {
  extractEligiblePreviewUrls,
  extractFirstEligiblePreviewUrl,
} from './extractEligiblePreviewUrl';
import {
  detectLinkPreviewProvider,
  fetchProviderLinkPreview,
} from './providerLinkPreview';
import type { LinkPreviewEntityType, LinkPreviewResult } from './linkPreview.types';

export type { LinkPreviewResult } from './linkPreview.types';
export type LinkPreviewOutcome = 'ready' | 'unsupported' | 'temporary';

type CacheEntry = {
  at: number;
  value: LinkPreviewResult | null;
  soft?: boolean;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_NEGATIVE_TTL_MS = 60 * 1000;
const CACHE_SOFT_NEGATIVE_TTL_MS = 20 * 1000;
const CACHE_MAX = 400;
const MUTABLE_STALE_TTL_MS = 5 * 60 * 1000;
const MUTABLE_GAME_FRESH_MS = 15 * 1000;
const MUTABLE_MARKET_FRESH_MS = 30 * 1000;
/** Keep send path snappy — only await cacheable bandeja snapshots. */

const cache = new Map<string, CacheEntry>();
const revalidating = new Map<string, Promise<void>>();

/** Safe to embed on ChatMessage for all thread members (no per-viewer ACL). */
const PERSISTABLE_ENTITY_TYPES = new Set<LinkPreviewEntityType>([
  'external',
  'app',
  'user',
  'market',
]);

export function isPersistableLinkPreview(preview: LinkPreviewResult | null): boolean {
  return !!preview && PERSISTABLE_ENTITY_TYPES.has(preview.entityType);
}

export function classifyLinkPreviewOutcome(
  urlString: string,
  preview: LinkPreviewResult | null
): LinkPreviewOutcome {
  if (preview) return 'ready';
  try {
    if (parseBandejaLink(urlString)) return 'unsupported';
    const normalized = normalizePreviewUrl(urlString);
    return cache.get(`ext:${normalized}`)?.soft ? 'temporary' : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export function resetLinkPreviewCacheForTests(): void {
  cache.clear();
  revalidating.clear();
}

function cacheGet(key: string): LinkPreviewResult | null | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  const ttl = entry.value
    ? CACHE_TTL_MS
    : entry.soft
      ? CACHE_SOFT_NEGATIVE_TTL_MS
      : CACHE_NEGATIVE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: LinkPreviewResult | null, soft = false): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value, soft: soft || undefined });
}

function mutableFreshMs(value: LinkPreviewResult): number {
  return value.entityType === 'market' ? MUTABLE_MARKET_FRESH_MS : MUTABLE_GAME_FRESH_MS;
}

function mutableCacheGet(
  key: string
): { value: LinkPreviewResult | null; stale: boolean } | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (!entry.value || !entry.value.mutable) {
    const value = cacheGet(key);
    return value === undefined ? undefined : { value, stale: false };
  }
  const age = Date.now() - entry.at;
  if (age > MUTABLE_STALE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return { value: entry.value, stale: age > mutableFreshMs(entry.value) };
}

function requiresViewerAclOnEveryRequest(
  kind: NonNullable<ReturnType<typeof parseBandejaLink>>['kind']
): boolean {
  return (
    kind === 'game' ||
    kind === 'gameChat' ||
    kind === 'gameLive' ||
    kind === 'userChat' ||
    kind === 'groupChat' ||
    kind === 'channelChat' ||
    kind === 'bug'
  );
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

/** Rewrite external image to short-lived HMAC proxy path for HTTP responses. */
export function presentLinkPreviewForClient(preview: LinkPreviewResult | null): LinkPreviewResult | null {
  if (!preview) return null;
  if (preview.source !== 'external' || !preview.imageUrl) return preview;
  if (preview.imageUrl.startsWith('/link-preview/')) return preview;
  const safe = isSafeHttpsImageUrl(preview.imageUrl);
  if (!safe) return { ...preview, imageUrl: null };
  const proxied = buildProxiedImagePath(safe);
  return proxied ? { ...preview, imageUrl: proxied } : preview;
}

function isRichPreview(preview: LinkPreviewResult | null): boolean {
  if (!preview) return false;
  return !!(
    preview.title ||
    preview.titleKey ||
    preview.description ||
    preview.descriptionKey ||
    preview.imageUrl ||
    preview.avatarUrl ||
    preview.playerAvatars.length > 0
  );
}

function emptyExtras(): Pick<
  LinkPreviewResult,
  | 'levelLabel'
  | 'playerAvatars'
  | 'provider'
  | 'status'
  | 'participantCount'
  | 'participantCapacity'
  | 'mutable'
  | 'refreshedAt'
> {
  return {
    levelLabel: null,
    playerAvatars: [],
    provider: null,
    status: null,
    participantCount: null,
    participantCapacity: null,
    mutable: false,
    refreshedAt: null,
  };
}

async function fetchExternalLinkPreview(
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

  const cached = cacheGet(`ext:${normalized}`);
  if (cached !== undefined) return cached;

  if (parseYoutubeVideoId(normalized)) {
    const yt = await fetchYoutubeLinkPreview(normalized, { fetchFn: options?.fetchFn });
    if (yt) {
      const canonical: LinkPreviewResult = {
        ...yt,
        imageUrl: isSafeHttpsImageUrl(yt.imageUrl),
      };
      cacheSet(`ext:${normalized}`, canonical);
      return canonical;
    }
  }

  const provider = detectLinkPreviewProvider(new URL(normalized));
  if (provider) {
    const dedicated = await fetchProviderLinkPreview(new URL(normalized), {
      fetchFn: options?.fetchFn,
    });
    if (dedicated) {
      const canonical = {
        ...dedicated,
        imageUrl: isSafeHttpsImageUrl(dedicated.imageUrl),
      };
      cacheSet(`ext:${normalized}`, canonical);
      return canonical;
    }
  }

  try {
    const { buffer, finalUrl, contentType } = await ssrfSafePublicFetchBytes(normalized, {
      timeoutMs: LINK_PREVIEW_FETCH_TIMEOUT_MS,
      fetchFn: options?.fetchFn,
    });

    if (isSkippedLinkPreviewHost(new URL(finalUrl).hostname)) {
      cacheSet(`ext:${normalized}`, null);
      return null;
    }

    const ct = (contentType ?? '').toLowerCase();
    if (ct && !ct.includes('text/html') && !ct.includes('application/xhtml')) {
      cacheSet(`ext:${normalized}`, null);
      return null;
    }

    const html = buffer.toString('utf8');
    const meta = parseOgMeta(html, finalUrl);
    if (!meta.title && !meta.description && !meta.imageUrl) {
      cacheSet(`ext:${normalized}`, null);
      return null;
    }

    const result: LinkPreviewResult = {
      url: normalized,
      finalUrl,
      source: 'external',
      entityType: 'external',
      title: meta.title,
      titleKey: null,
      description: meta.description,
      descriptionKey: null,
      imageUrl: isSafeHttpsImageUrl(meta.imageUrl),
      siteName: meta.siteName,
      hostname: hostnameFromUrl(finalUrl),
      badgeKey: null,
      avatarUrl: null,
      sport: null,
      ...emptyExtras(),
      provider,
    };
    cacheSet(`ext:${normalized}`, result);
    return result;
  } catch (err) {
    const soft =
      err instanceof SsrfFetchError &&
      (err.message.includes('timed out') || err.message.includes('Fetch failed'));
    if (!(err instanceof SsrfFetchError)) {
      console.warn('[linkPreview] unexpected', err instanceof Error ? err.message : err);
    }
    cacheSet(`ext:${normalized}`, null, soft);
    return null;
  }
}

/**
 * Resolve chat link preview: bandeja entities from DB, else provider / external OG unfurl.
 * Returns canonical image URLs (proxy applied via presentLinkPreviewForClient).
 */
export async function fetchLinkPreview(
  urlString: string,
  options?: { viewerUserId?: string; fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  const bandeja = parseBandejaLink(urlString);
  if (bandeja) {
    const viewerScoped = requiresViewerAclOnEveryRequest(bandeja.kind);
    const cacheKey = `bj:${bandeja.kind}:${bandeja.id ?? bandeja.pathname}${bandeja.search}:${
      viewerScoped ? (options?.viewerUserId ?? '') : 'shared'
    }`;
    if (!options?.viewerUserId) {
      cacheSet(cacheKey, null, true);
      return null;
    }
    const viewerCanSee =
      !viewerScoped || (await canViewBandejaLinkPreview(bandeja, options.viewerUserId));
    const cached = viewerCanSee ? mutableCacheGet(cacheKey) : undefined;
    if (cached && !cached.stale) return cached.value;
    if (!viewerCanSee) {
      return fetchBandejaLinkPreview(bandeja, options.viewerUserId);
    }
    if (cached?.stale) {
      if (!revalidating.has(cacheKey)) {
        const pending = fetchBandejaLinkPreview(bandeja, options.viewerUserId)
          .then((preview) => {
            cacheSet(cacheKey, isRichPreview(preview) ? preview : null);
          })
          .catch(() => undefined)
          .finally(() => {
            revalidating.delete(cacheKey);
          });
        revalidating.set(cacheKey, pending);
      }
      return cached.value;
    }
    const preview = await fetchBandejaLinkPreview(bandeja, options.viewerUserId);
    const rich = isRichPreview(preview) ? preview : null;
    cacheSet(cacheKey, rich);
    return rich;
  }

  return fetchExternalLinkPreview(urlString, { fetchFn: options?.fetchFn });
}

/**
 * Snapshot at send for shared instant cards. Only persistable (non-ACL) types.
 * Cache-only lookup so message creation never waits on preview enrichment.
 */
export function resolveLinkPreviewForOutgoingMessage(
  content: string | null | undefined,
  preferredUrl?: string | null
): LinkPreviewResult | null {
  const eligibleUrls = extractEligiblePreviewUrls(content);
  const url =
    (preferredUrl && eligibleUrls.includes(preferredUrl) ? preferredUrl : null) ??
    extractFirstEligiblePreviewUrl(content);
  if (!url) return null;

  const bandeja = parseBandejaLink(url);
  // External OG is slow — clients + paste prefetch handle it; don't block send.
  if (!bandeja) return null;
  // Viewer-scoped entities must not be snapshotted onto the message.
  if (
    bandeja.kind === 'userChat' ||
    bandeja.kind === 'groupChat' ||
    bandeja.kind === 'channelChat' ||
    bandeja.kind === 'bug' ||
    bandeja.kind === 'game' ||
    bandeja.kind === 'gameChat' ||
    bandeja.kind === 'gameLive'
  ) {
    return null;
  }

  const cacheKey = `bj:${bandeja.kind}:${bandeja.id ?? bandeja.pathname}${bandeja.search}:shared`;
  const cached = mutableCacheGet(cacheKey);
  const preview = cached?.value ?? null;
  return isPersistableLinkPreview(preview) ? preview : null;
}
