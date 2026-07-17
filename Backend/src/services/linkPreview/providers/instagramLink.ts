import { parseOgMeta } from '../parseOgMeta';
import type { LinkPreviewResult } from '../linkPreview.types';
import { ssrfSafePublicFetchBytes } from '../ssrfSafePublicFetch';

export function isInstagramLink(url: URL): boolean {
  return /(^|\.)instagram\.com$/i.test(url.hostname) && /^\/(p|reel|reels|tv)\//.test(url.pathname);
}

type InstagramOEmbed = {
  provider_name?: string;
  html?: string;
};

function compactTitle(title: string | null | undefined): string {
  if (!title) return 'Instagram';
  const account = title.match(/^(@[^\s:]+)\s+on Instagram(?::.*)?$/i);
  if (account?.[1]) return `${account[1]} on Instagram`;
  const separator = title.indexOf(':');
  return (separator > 0 ? title.slice(0, separator) : title).trim().slice(0, 80) || 'Instagram';
}

async function fetchOEmbed(
  url: URL,
  fetchFn?: typeof fetch
): Promise<InstagramOEmbed | null> {
  const endpoint = new URL('https://graph.facebook.com/v25.0/instagram_oembed');
  endpoint.searchParams.set('url', url.toString());
  const token = process.env.INSTAGRAM_OEMBED_ACCESS_TOKEN?.trim();
  if (token) endpoint.searchParams.set('access_token', token);

  try {
    const response = await ssrfSafePublicFetchBytes(endpoint.toString(), {
      timeoutMs: 2_500,
      maxBytes: 128 * 1024,
      fetchFn,
      accept: 'application/json',
    });
    const contentType = (response.contentType ?? '').toLowerCase();
    if (contentType && !contentType.includes('json')) return null;
    const data = JSON.parse(response.buffer.toString('utf8')) as InstagramOEmbed;
    return data.provider_name || data.html ? data : null;
  } catch {
    return null;
  }
}

async function fetchPageMetadata(
  url: URL,
  fetchFn?: typeof fetch
): Promise<{
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
} | null> {
  try {
    const response = await ssrfSafePublicFetchBytes(url.toString(), {
      timeoutMs: 3_500,
      maxBytes: 1024 * 1024,
      fetchFn,
    });
    return {
      finalUrl: response.finalUrl,
      ...parseOgMeta(response.buffer.toString('utf8'), response.finalUrl),
    };
  } catch {
    return null;
  }
}

export async function fetchInstagramLinkPreview(
  url: URL,
  options?: { fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  if (!isInstagramLink(url)) return null;
  const [oembed, metadata] = await Promise.all([
    fetchOEmbed(url, options?.fetchFn),
    fetchPageMetadata(url, options?.fetchFn),
  ]);
  if (!oembed && !metadata) return null;

  return {
    url: url.toString(),
    finalUrl: metadata?.finalUrl ?? url.toString(),
    source: 'external',
    entityType: 'external',
    title: compactTitle(metadata?.title),
    titleKey: null,
    description: null,
    descriptionKey: null,
    imageUrl: metadata?.imageUrl ?? null,
    siteName: metadata?.siteName ?? oembed?.provider_name ?? 'Instagram',
    hostname: 'instagram.com',
    badgeKey: null,
    avatarUrl: null,
    sport: null,
    levelLabel: null,
    playerAvatars: [],
    provider: 'instagram',
    status: null,
    participantCount: null,
    participantCapacity: null,
    mutable: false,
    refreshedAt: null,
  };
}
