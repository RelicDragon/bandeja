import api from './axios';
import type { ApiResponse } from '@/types';

export type GiphySearchItem = {
  provider: 'GIPHY' | 'KLIPY';
  id: string;
  title: string;
  previewUrl: string;
  staticUrl?: string;
  downloadUrl: string;
  width: number;
  height: number;
};

export type GiphySearchPage = {
  provider: 'GIPHY' | 'KLIPY';
  items: GiphySearchItem[];
  offset: number;
  nextOffset: number;
  limit: number;
  totalCount: number;
  hasMore: boolean;
};

export type GiphyImportResult = {
  mediaUrl: string;
  thumbnailUrl: string;
};

let statusCache: { available: boolean; at: number } | null = null;
const STATUS_TTL_AVAILABLE_MS = 60_000;
const STATUS_TTL_UNAVAILABLE_MS = 15_000;

export async function getGiphyStatus(options?: { force?: boolean }): Promise<boolean> {
  const now = Date.now();
  if (!options?.force && statusCache) {
    const ttl = statusCache.available ? STATUS_TTL_AVAILABLE_MS : STATUS_TTL_UNAVAILABLE_MS;
    if (now - statusCache.at < ttl) return statusCache.available;
  }
  try {
    const { data } = await api.get<ApiResponse<{ available: boolean }>>('/giphy/status');
    const available = !!data.data?.available;
    statusCache = { available, at: now };
    return available;
  } catch {
    statusCache = { available: false, at: now };
    return false;
  }
}

export function clearGiphyStatusCache(): void {
  statusCache = null;
}

export async function searchGiphy(
  q: string,
  options?: {
    offset?: number;
    limit?: number;
    provider?: 'GIPHY' | 'KLIPY';
    signal?: AbortSignal;
  }
): Promise<GiphySearchPage> {
  const { data } = await api.get<ApiResponse<GiphySearchPage>>('/giphy/search', {
    params: {
      q: q.trim() || undefined,
      offset: options?.offset ?? 0,
      limit: options?.limit ?? 24,
      provider: options?.provider,
    },
    timeout: 15_000,
    signal: options?.signal,
  });
  if (!data.data) throw new Error('giphy_search_empty');
  return data.data;
}

export async function trendingGiphy(options?: {
  offset?: number;
  limit?: number;
  provider?: 'GIPHY' | 'KLIPY';
  signal?: AbortSignal;
}): Promise<GiphySearchPage> {
  const { data } = await api.get<ApiResponse<GiphySearchPage>>('/giphy/trending', {
    params: {
      offset: options?.offset ?? 0,
      limit: options?.limit ?? 24,
      provider: options?.provider,
    },
    timeout: 15_000,
    signal: options?.signal,
  });
  if (!data.data) throw new Error('giphy_search_empty');
  return data.data;
}

export async function importGiphyGif(
  downloadUrl: string,
  options?: { signal?: AbortSignal }
): Promise<GiphyImportResult> {
  // Import can fetch up to ~8s + validate + S3; keep above default 10s axios timeout.
  const { data } = await api.post<ApiResponse<GiphyImportResult>>(
    '/giphy/import',
    { downloadUrl },
    { timeout: 45_000, signal: options?.signal }
  );
  if (!data.data?.mediaUrl || !data.data.thumbnailUrl) {
    throw new Error('giphy_import_empty');
  }
  return data.data;
}
