import api from './axios';
import { SEND_VIDEO_UPLOAD_PHASE_MS } from '@/constants/chatVideo';
import type { ApiResponse, Club } from '@/types';

export interface MediaUploadResponse {
  avatarUrl: string;
  originalAvatarUrl: string;
  avatarSize: { width: number; height: number };
  originalSize: { width: number; height: number };
  /** User avatar routes only: the animated WebP, or null after a still upload. */
  avatarAnimatedUrl?: string | null;
}

export type UploadProgressHandler = (fraction: number) => void;

function progressConfig(onProgress?: UploadProgressHandler) {
  return {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...(onProgress && {
      onUploadProgress: (e: { loaded: number; total?: number }) => {
        if (e.total) onProgress(Math.min(1, e.loaded / e.total));
      },
    }),
  };
}

export interface ChatImageUploadResponse {
  originalUrl: string;
  thumbnailUrl: string;
  originalSize: { width: number; height: number };
  thumbnailSize: { width: number; height: number };
}

export interface ChatAudioUploadResponse {
  audioUrl: string;
}

export interface ChatVideoUploadResponse {
  videoUrl: string;
  thumbnailUrl: string;
  durationMs: number;
  width: number;
  height: number;
}

export interface ChatDocumentUploadResponse {
  fileUrl: string;
  thumbnailUrl?: string;
  originalName: string;
  size: number;
  mimetype: string;
}

async function postMultipartAvatarUpload(
  path: string,
  avatarFile: File,
  originalFile: File,
  extraFields?: Record<string, string>
): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append('avatar', avatarFile);
  formData.append('original', originalFile);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }
  const response = await api.post<ApiResponse<MediaUploadResponse>>(path, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data.data;
}

export const mediaApi = {
  uploadAvatar: (avatarFile: File, originalFile: File) =>
    postMultipartAvatarUpload('/media/upload/avatar', avatarFile, originalFile),

  /** Premium: raw GIF/animated WebP + square crop in source pixels. */
  uploadAnimatedAvatar: async (
    file: File,
    crop: { x: number; y: number; size: number },
    onProgress?: UploadProgressHandler
  ): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('animated', file);
    formData.append('x', String(crop.x));
    formData.append('y', String(crop.y));
    formData.append('size', String(crop.size));
    const response = await api.post<ApiResponse<MediaUploadResponse>>(
      '/media/upload/avatar/animated',
      formData,
      progressConfig(onProgress)
    );
    return response.data.data;
  },

  /** Premium: 256x256 frames cut client-side from a trimmed video (never the video itself). */
  uploadAvatarFrames: async (
    frames: Blob[],
    fps: number,
    onProgress?: UploadProgressHandler
  ): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    frames.forEach((frame, i) => {
      const ext = frame.type === 'image/webp' ? 'webp' : 'jpg';
      formData.append('frames', frame, `frame_${String(i).padStart(2, '0')}.${ext}`);
    });
    formData.append('fps', String(fps));
    const response = await api.post<ApiResponse<MediaUploadResponse>>(
      '/media/upload/avatar/frames',
      formData,
      progressConfig(onProgress)
    );
    return response.data.data;
  },

  uploadGameAvatar: (gameId: string, avatarFile: File, originalFile: File) =>
    postMultipartAvatarUpload('/media/upload/game/avatar', avatarFile, originalFile, { gameId }),

  uploadGroupChannelAvatar: (groupChannelId: string, avatarFile: File, originalFile: File) =>
    postMultipartAvatarUpload('/media/upload/group-channel/avatar', avatarFile, originalFile, {
      groupChannelId,
    }),

  uploadUserTeamAvatar: (userTeamId: string, avatarFile: File, originalFile: File) =>
    postMultipartAvatarUpload('/media/upload/user-team/avatar', avatarFile, originalFile, {
      userTeamId,
    }),

  uploadClubAvatar: async (clubId: string, imageFile: File): Promise<MediaUploadResponse> => {
    const formData = new FormData();
    formData.append('original', imageFile);
    formData.append('clubId', clubId);
    const response = await api.post<ApiResponse<MediaUploadResponse>>('/media/upload/club/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadClubPhoto: async (clubId: string, imageFile: File): Promise<Club> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('clubId', clubId);
    const response = await api.post<ApiResponse<Club>>('/media/upload/club/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadClubReviewPhoto: async (clubId: string, gameId: string, imageFile: File): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('clubId', clubId);
    formData.append('gameId', gameId);
    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/club/review-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadEventHero: async (imageFile: File): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/event/hero', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadMarketItemImage: async (imageFile: File): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/market-item/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadChatImage: async (
    imageFile: File,
    contextId: string,
    contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP',
    options?: { signal?: AbortSignal }
  ): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    if (contextType === 'BUG') {
      formData.append('bugId', contextId);
    } else if (contextType === 'USER') {
      formData.append('userChatId', contextId);
    } else if (contextType === 'GROUP') {
      formData.append('groupChannelId', contextId);
    } else {
      formData.append('gameId', contextId);
    }

    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/chat/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: options?.signal,
    });

    return response.data.data;
  },

  uploadChatAudio: async (
    audioBlob: Blob,
    filename: string,
    contextId: string,
    contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP',
    options?: { signal?: AbortSignal }
  ): Promise<ChatAudioUploadResponse> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, filename);
    if (contextType === 'BUG') {
      formData.append('bugId', contextId);
    } else if (contextType === 'USER') {
      formData.append('userChatId', contextId);
    } else if (contextType === 'GROUP') {
      formData.append('groupChannelId', contextId);
    } else {
      formData.append('gameId', contextId);
    }
    const response = await api.post<ApiResponse<ChatAudioUploadResponse>>('/media/upload/chat/audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal: options?.signal,
    });
    return response.data.data;
  },

  uploadChatVideo: async (
    videoFile: File,
    contextId: string,
    contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP',
    options?: {
      signal?: AbortSignal;
      posterFile?: File;
      durationMs?: number;
      width?: number;
      height?: number;
      onUploadProgress?: (progress: number) => void;
    }
  ): Promise<ChatVideoUploadResponse> => {
    const formData = new FormData();
    formData.append('video', videoFile);
    if (options?.posterFile) {
      formData.append('poster', options.posterFile);
    }
    if (options?.durationMs != null) {
      formData.append('durationMs', String(options.durationMs));
    }
    if (options?.width != null) {
      formData.append('width', String(options.width));
    }
    if (options?.height != null) {
      formData.append('height', String(options.height));
    }
    if (contextType === 'BUG') {
      formData.append('bugId', contextId);
    } else if (contextType === 'USER') {
      formData.append('userChatId', contextId);
    } else if (contextType === 'GROUP') {
      formData.append('groupChannelId', contextId);
    } else {
      formData.append('gameId', contextId);
    }

    const response = await api.post<ApiResponse<ChatVideoUploadResponse>>(
      '/media/upload/chat/video',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: options?.signal,
        timeout: SEND_VIDEO_UPLOAD_PHASE_MS,
        onUploadProgress: options?.onUploadProgress
          ? (ev) => {
              const total = ev.total ?? 0;
              if (total > 0) options.onUploadProgress!(ev.loaded / total);
            }
          : undefined,
      }
    );
    return response.data.data;
  },

  uploadChatDocument: async (
    documentFile: File,
    contextId: string,
    contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP',
    options?: { signal?: AbortSignal }
  ): Promise<ChatDocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('document', documentFile);
    if (contextType === 'BUG') {
      formData.append('bugId', contextId);
    } else if (contextType === 'USER') {
      formData.append('userChatId', contextId);
    } else if (contextType === 'GROUP') {
      formData.append('groupChannelId', contextId);
    } else {
      formData.append('gameId', contextId);
    }

    const response = await api.post<ApiResponse<ChatDocumentUploadResponse>>(
      '/media/upload/chat/document',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: options?.signal,
      }
    );
    return response.data.data;
  },
};
