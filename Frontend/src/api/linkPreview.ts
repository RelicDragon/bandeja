import type { ApiResponse, BasicUser } from '@/types';
import api from './axios';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import { isAxiosError } from 'axios';

export type LinkPreviewData = {
  url: string;
  finalUrl: string;
  source: 'external' | 'bandeja';
  entityType:
    | 'external'
    | 'game'
    | 'gameChat'
    | 'gameLive'
    | 'user'
    | 'userChat'
    | 'group'
    | 'channel'
    | 'bug'
    | 'market'
    | 'app';
  title: string | null;
  titleKey: string | null;
  description: string | null;
  descriptionKey: string | null;
  imageUrl: string | null;
  siteName: string | null;
  hostname: string;
  badgeKey: string | null;
  avatarUrl: string | null;
  sport: string | null;
  levelLabel: string | null;
  playerAvatars: string[];
  provider: 'youtube' | 'spotify' | 'instagram' | 'tiktok' | 'x' | 'github' | 'playtomic' | null;
  status: string | null;
  participantCount: number | null;
  participantCapacity: number | null;
  mutable: boolean;
  refreshedAt: string | null;
  profileUser?: BasicUser | null;
};

export type LinkPreviewOutcome = 'ready' | 'unsupported' | 'temporary';
export type LinkPreviewResponse = {
  preview: LinkPreviewData | null;
  outcome: LinkPreviewOutcome;
  retryAfterMs: number | null;
  snapshotToken: string | null;
};

export function isRichLinkPreview(data: LinkPreviewData | null | undefined): data is LinkPreviewData {
  return !!(
    data &&
    (data.title ||
      data.titleKey ||
      data.description ||
      data.descriptionKey ||
      data.imageUrl ||
      data.avatarUrl ||
      (data.playerAvatars && data.playerAvatars.length > 0))
  );
}

/** Resolve BE proxy paths (`/link-preview/image?...`) against API base. */
export function resolveLinkPreviewImageSrc(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/link-preview/')) {
    const base = getApiAxiosBaseURL().replace(/\/$/, '');
    return `${base}${imageUrl}`;
  }
  return imageUrl;
}

export async function fetchLinkPreview(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<LinkPreviewData | null> {
  const result = await fetchLinkPreviewDetailed(url, options);
  return result.preview;
}

export async function fetchLinkPreviewDetailed(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<LinkPreviewResponse> {
  let response;
  try {
    response = await api.get<
      ApiResponse<LinkPreviewData | null> & {
        meta?: { outcome?: LinkPreviewOutcome; snapshotToken?: string | null };
      }
    >('/link-preview', {
      params: { url },
      signal: options?.signal,
      timeout: 8_000,
    });
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429) {
      const retryAfter = Number(error.response.headers['retry-after']);
      return {
        preview: null,
        outcome: 'temporary',
        retryAfterMs:
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 60_000,
        snapshotToken: null,
      };
    }
    throw error;
  }
  const retryAfter = Number(response.headers['retry-after']);
  return {
    preview: response.data.data ?? null,
    outcome:
      response.data.meta?.outcome ??
      (isRichLinkPreview(response.data.data) ? 'ready' : 'unsupported'),
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
    snapshotToken: response.data.meta?.snapshotToken ?? null,
  };
}
