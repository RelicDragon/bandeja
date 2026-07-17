import type { LinkPreviewProvider, LinkPreviewResult } from './linkPreview.types';
import { ssrfSafePublicFetchBytes } from './ssrfSafePublicFetch';
import { parseGitHubRepositoryLink } from './providers/githubLink';
import {
  fetchInstagramLinkPreview,
  isInstagramLink,
} from './providers/instagramLink';
import {
  fetchPlaytomicLinkPreview,
  isPlaytomicLink,
} from './providers/playtomicLink';
import { isSpotifyLink } from './providers/spotifyLink';
import { isTikTokLink } from './providers/tiktokLink';
import { isXLink } from './providers/xLink';

type OEmbed = {
  title?: string;
  author_name?: string;
  provider_name?: string;
  thumbnail_url?: string;
};

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().slice(0, 300) || null : null;
}

function result(
  url: URL,
  provider: LinkPreviewProvider,
  metadata: { title?: unknown; description?: unknown; imageUrl?: unknown; siteName: string }
): LinkPreviewResult {
  return {
    url: url.toString(),
    finalUrl: url.toString(),
    source: 'external',
    entityType: 'external',
    title: text(metadata.title) ?? metadata.siteName,
    titleKey: null,
    description: text(metadata.description),
    descriptionKey: null,
    imageUrl: text(metadata.imageUrl),
    siteName: metadata.siteName,
    hostname: url.hostname.replace(/^www\./i, ''),
    badgeKey: null,
    avatarUrl: null,
    sport: null,
    levelLabel: null,
    playerAvatars: [],
    provider,
    status: null,
    participantCount: null,
    participantCapacity: null,
    mutable: false,
    refreshedAt: null,
  };
}

async function json(url: string, fetchFn?: typeof fetch): Promise<Record<string, unknown> | null> {
  try {
    const response = await ssrfSafePublicFetchBytes(url, {
      timeoutMs: 2_500,
      maxBytes: 128 * 1024,
      fetchFn,
      accept: 'application/json',
    });
    const contentType = (response.contentType ?? '').toLowerCase();
    if (contentType && !contentType.includes('json')) return null;
    return JSON.parse(response.buffer.toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function oembed(
  endpoint: string,
  sourceUrl: URL,
  provider: LinkPreviewProvider,
  siteName: string,
  fetchFn?: typeof fetch
): Promise<LinkPreviewResult | null> {
  const data = (await json(endpoint, fetchFn)) as OEmbed | null;
  if (!data) return null;
  const title = text(data.title) ?? text(data.author_name);
  const imageUrl = text(data.thumbnail_url);
  if (!title && !imageUrl) return null;
  return result(sourceUrl, provider, {
    title,
    description: data.author_name && data.author_name !== title ? data.author_name : null,
    imageUrl,
    siteName: text(data.provider_name) ?? siteName,
  });
}

export function detectLinkPreviewProvider(url: URL): LinkPreviewProvider | null {
  if (isSpotifyLink(url)) return 'spotify';
  if (isInstagramLink(url)) return 'instagram';
  if (isTikTokLink(url)) return 'tiktok';
  if (isXLink(url)) return 'x';
  if (parseGitHubRepositoryLink(url)) return 'github';
  if (isPlaytomicLink(url)) return 'playtomic';
  return null;
}

export async function fetchProviderLinkPreview(
  url: URL,
  options?: { fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  const provider = detectLinkPreviewProvider(url);
  if (!provider) return null;

  if (provider === 'spotify') {
    return oembed(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(url.toString())}`,
      url,
      provider,
      'Spotify',
      options?.fetchFn
    );
  }
  if (provider === 'tiktok') {
    return oembed(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.toString())}`,
      url,
      provider,
      'TikTok',
      options?.fetchFn
    );
  }
  if (provider === 'x') {
    return oembed(
      `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url.toString())}`,
      url,
      provider,
      'X',
      options?.fetchFn
    );
  }
  if (provider === 'instagram') {
    return fetchInstagramLinkPreview(url, options);
  }
  if (provider === 'github') {
    const repository = parseGitHubRepositoryLink(url);
    if (!repository) return null;
    const data = await json(
      `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`,
      options?.fetchFn
    );
    if (!data) return null;
    return result(url, provider, {
      title: data.full_name,
      description: data.description,
      imageUrl:
        data.owner && typeof data.owner === 'object'
          ? (data.owner as Record<string, unknown>).avatar_url
          : null,
      siteName: 'GitHub',
    });
  }
  if (provider === 'playtomic') {
    return fetchPlaytomicLinkPreview(url, options);
  }

  return null;
}
