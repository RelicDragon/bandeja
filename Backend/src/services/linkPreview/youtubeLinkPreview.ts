import type { LinkPreviewResult } from './linkPreview.types';
import {
  assertPublicHttpsUrl,
  LINK_PREVIEW_FETCH_TIMEOUT_MS,
  ssrfSafePublicFetchBytes,
  SsrfFetchError,
} from './ssrfSafePublicFetch';

const YT_HOST_RE = /(^|\.)youtube\.com$/i;
const YT_SHORT_RE = /^youtu\.be$/i;

export function parseYoutubeVideoId(urlString: string): string | null {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^www\./i, '');

  if (YT_SHORT_RE.test(host)) {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }

  if (!YT_HOST_RE.test(host)) return null;

  if (u.pathname === '/watch') {
    const v = u.searchParams.get('v');
    return v && /^[\w-]{6,}$/.test(v) ? v : null;
  }

  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') {
    const id = parts[1];
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  }

  return null;
}

function youtubeThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export async function fetchYoutubeLinkPreview(
  urlString: string,
  options?: { fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  const videoId = parseYoutubeVideoId(urlString);
  if (!videoId) return null;

  const canonical = `https://www.youtube.com/watch?v=${videoId}`;
  let normalized = canonical;
  try {
    const raw = urlString.startsWith('http') ? urlString : `https://${urlString}`;
    const asHttps = raw.replace(/^http:\/\//i, 'https://');
    normalized = assertPublicHttpsUrl(asHttps).toString();
  } catch {
    normalized = canonical;
  }

  let title: string | null = null;
  let author: string | null = null;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const { buffer, contentType } = await ssrfSafePublicFetchBytes(oembedUrl, {
      timeoutMs: Math.min(LINK_PREVIEW_FETCH_TIMEOUT_MS, 2500),
      maxBytes: 64 * 1024,
      fetchFn: options?.fetchFn,
      accept: 'application/json',
    });
    const ct = (contentType ?? '').toLowerCase();
    if (ct.includes('json') || !ct) {
      const json = JSON.parse(buffer.toString('utf8')) as {
        title?: string;
        author_name?: string;
      };
      title = typeof json.title === 'string' ? json.title.trim() || null : null;
      author = typeof json.author_name === 'string' ? json.author_name.trim() || null : null;
    }
  } catch (err) {
    if (!(err instanceof SsrfFetchError)) {
      console.warn('[linkPreview] youtube oembed', err instanceof Error ? err.message : err);
    }
  }

  if (!title) title = 'YouTube';

  return {
    url: normalized,
    finalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    source: 'external',
    entityType: 'external',
    title,
    titleKey: null,
    description: author,
    descriptionKey: null,
    imageUrl: youtubeThumb(videoId),
    siteName: 'YouTube',
    hostname: 'youtube.com',
    badgeKey: null,
    avatarUrl: null,
    sport: null,
    levelLabel: null,
    playerAvatars: [],
    provider: 'youtube',
    status: null,
    participantCount: null,
    participantCapacity: null,
    mutable: false,
    refreshedAt: null,
  };
}
