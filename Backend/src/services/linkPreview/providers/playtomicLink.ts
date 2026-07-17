import { parseOgMeta } from '../parseOgMeta';
import type { LinkPreviewResult } from '../linkPreview.types';
import { ssrfSafePublicFetchBytes } from '../ssrfSafePublicFetch';

export function isPlaytomicLink(url: URL): boolean {
  return /(^|\.)playtomic\.io$/i.test(url.hostname) || /(^|\.)playtomic\.com$/i.test(url.hostname);
}

export async function fetchPlaytomicLinkPreview(
  url: URL,
  options?: { fetchFn?: typeof fetch }
): Promise<LinkPreviewResult | null> {
  try {
    const { buffer, finalUrl, contentType } = await ssrfSafePublicFetchBytes(url.toString(), {
      timeoutMs: 2_500,
      maxBytes: 384 * 1024,
      fetchFn: options?.fetchFn,
    });
    if (contentType && !contentType.toLowerCase().includes('html')) return null;
    const metadata = parseOgMeta(buffer.toString('utf8'), finalUrl);
    if (!metadata.title && !metadata.description && !metadata.imageUrl) return null;
    return {
      url: url.toString(),
      finalUrl,
      source: 'external',
      entityType: 'external',
      title: metadata.title || 'Playtomic',
      titleKey: null,
      description: metadata.description,
      descriptionKey: null,
      imageUrl: metadata.imageUrl,
      siteName: metadata.siteName || 'Playtomic',
      hostname: new URL(finalUrl).hostname.replace(/^www\./i, ''),
      badgeKey: null,
      avatarUrl: null,
      sport: null,
      levelLabel: null,
      playerAvatars: [],
      provider: 'playtomic',
      status: null,
      participantCount: null,
      participantCapacity: null,
      mutable: false,
      refreshedAt: null,
    };
  } catch {
    return null;
  }
}
