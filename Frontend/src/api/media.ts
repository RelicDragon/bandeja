import api from './axios';
import { ApiResponse } from '@/types';

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

export const mediaApi = {
  uploadAvatar: async (avatarFile: File, originalFile: File): Promise<MediaUploadResponse> => {
    console.log('mediaApi.uploadAvatar: Received files:', {
      avatarFile: { name: avatarFile.name, size: avatarFile.size, type: avatarFile.type },
      originalFile: { name: originalFile.name, size: originalFile.size, type: originalFile.type }
    });

    const formData = new FormData();
    formData.append('avatar', avatarFile);
    formData.append('original', originalFile);

    console.log('mediaApi.uploadAvatar: FormData entries:');
    for (const [key, value] of formData.entries()) {
      console.log(`  ${key}:`, value);
    }

    const response = await api.post<ApiResponse<MediaUploadResponse>>('/media/upload/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data.data;
  },

  uploadChatImage: async (imageFile: File, gameId: string): Promise<ChatImageUploadResponse> => {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('gameId', gameId);

    const response = await api.post<ApiResponse<ChatImageUploadResponse>>('/media/upload/chat/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data.data;
  },
};
