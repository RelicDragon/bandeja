import api from './axios';
import type { ApiResponse } from '@/types';

export type LinkPreviewData = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  hostname: string;
};

export async function fetchLinkPreview(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<LinkPreviewData | null> {
  const { data } = await api.get<ApiResponse<LinkPreviewData | null>>('/link-preview', {
    params: { url },
    signal: options?.signal,
    timeout: 8_000,
  });
  return data.data ?? null;
}
