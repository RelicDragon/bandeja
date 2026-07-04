import api from './axios';
import type { ApiResponse } from '@/types';

export type GamePhotoUploader = {
  id: string;
  name: string;
  avatar?: string | null;
};

export type GamePhoto = {
  id: string;
  gameId: string;
  originalUrl: string;
  thumbnailUrl: string;
  uploader?: GamePhotoUploader | null;
  createdAt: string;
};

export type GamePhotoListResponse = {
  items: GamePhoto[];
  nextCursor: string | null;
};

export type GamePhotoSetMainResponse = {
  gameId: string;
  mainPhotoId: string | null;
};

export type GamePhotoDeletedResponse = {
  ok: true;
};

function newClientUploadId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const gamePhotosApi = {
  list: async (
    gameId: string,
    params?: { limit?: number; cursor?: string | null }
  ): Promise<GamePhotoListResponse> => {
    const response = await api.get<ApiResponse<GamePhotoListResponse>>(`/games/${gameId}/photos`, {
      params: {
        limit: params?.limit ?? 50,
        ...(params?.cursor ? { cursor: params.cursor } : {}),
      },
    });
    return response.data.data;
  },

  upload: async (
    gameId: string,
    file: File,
    options?: { signal?: AbortSignal; clientUploadId?: string }
  ): Promise<GamePhoto> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('clientUploadId', options?.clientUploadId ?? newClientUploadId());

    const response = await api.post<ApiResponse<GamePhoto>>(`/games/${gameId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options?.signal,
      timeout: 60_000,
    });
    return response.data.data;
  },

  setMain: async (gameId: string, photoId: string | null): Promise<GamePhotoSetMainResponse> => {
    const response = await api.patch<ApiResponse<GamePhotoSetMainResponse>>(
      `/games/${gameId}/photos/main`,
      { photoId }
    );
    return response.data.data;
  },

  delete: async (gameId: string, photoId: string): Promise<GamePhotoDeletedResponse> => {
    const response = await api.delete<ApiResponse<GamePhotoDeletedResponse>>(
      `/games/${gameId}/photos/${photoId}`
    );
    return response.data.data;
  },
};
