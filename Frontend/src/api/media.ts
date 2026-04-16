import api from './axios';
import type { ApiResponse, Club } from '@/types';

export interface MediaUploadResponse {
  avatarUrl: string;
  originalAvatarUrl: string;
  avatarSize: { width: number; height: number };
  originalSize: { width: number; height: number };
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

  uploadMarketItemImage: async (imageFile: File): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/market-item/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  uploadChatImage: async (imageFile: File, contextId: string, contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP'): Promise<ChatImageUploadResponse> => {
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
    });
    
    return response.data.data;
  },

  uploadChatAudio: async (audioBlob: Blob, filename: string, contextId: string, contextType?: 'GAME' | 'BUG' | 'USER' | 'GROUP'): Promise<ChatAudioUploadResponse> => {
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
    });
    return response.data.data;
  },
};
