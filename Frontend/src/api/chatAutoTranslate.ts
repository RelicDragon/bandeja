import api from './axios';
import type { ApiResponse } from '@/types';
import type { ChatContextType } from './chat';
import type { ChatType } from '@/types';

export interface ChatAutoTranslateConfig {
  languageCodes: string[];
  maxSlots: number;
  canEdit: boolean;
}

export const chatAutoTranslateApi = {
  getConfig: async (
    chatContextType: ChatContextType,
    contextId: string,
    chatType?: ChatType
  ): Promise<ChatAutoTranslateConfig> => {
    const response = await api.get<ApiResponse<ChatAutoTranslateConfig>>('/chat/auto-translate-config', {
      params: { chatContextType, contextId, ...(chatType ? { chatType } : {}) },
    });
    return response.data.data!;
  },

  setConfig: async (
    chatContextType: ChatContextType,
    contextId: string,
    languageCodes: string[],
    chatType?: ChatType
  ): Promise<ChatAutoTranslateConfig> => {
    const response = await api.put<ApiResponse<ChatAutoTranslateConfig>>('/chat/auto-translate-config', {
      chatContextType,
      contextId,
      languageCodes,
      ...(chatType ? { chatType } : {}),
    });
    return response.data.data!;
  },
};
