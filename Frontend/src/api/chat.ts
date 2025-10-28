import api from './axios';
import { ApiResponse, Game, ChatType } from '@/types';

export type MessageState = 'SENT' | 'DELIVERED' | 'READ';

export interface ChatMessage {
  id: string;
  gameId: string;
  senderId: string | null;
  content: string;
  mediaUrls: string[];
  thumbnailUrls: string[];
  state: MessageState;
  chatType: ChatType;
  createdAt: string;
  updatedAt: string;
  replyToId?: string;
  replyTo?: {
    id: string;
    content: string;
    sender: {
      id: string;
      firstName?: string;
      lastName?: string;
    };
  };
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  } | null;
  reactions: MessageReaction[];
  readReceipts: MessageReadReceipt[];
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  };
}

export interface MessageReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  };
}

export interface CreateMessageRequest {
  gameId: string;
  content: string;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  replyToId?: string;
  chatType?: ChatType;
}

export interface UpdateMessageStateRequest {
  state: MessageState;
}

export interface AddReactionRequest {
  emoji: string;
}

export const chatApi = {
  createMessage: async (data: CreateMessageRequest) => {
    const response = await api.post<ApiResponse<ChatMessage>>('/chat/messages', data);
    return response.data.data;
  },

  getGameMessages: async (gameId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/games/${gameId}/messages`, {
      params: { page, limit, chatType }
    });
    return response.data.data;
  },

  updateMessageState: async (messageId: string, data: UpdateMessageStateRequest) => {
    const response = await api.patch<ApiResponse<void>>(`/chat/messages/${messageId}/state`, data);
    return response.data;
  },

  markMessageAsRead: async (messageId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/chat/messages/${messageId}/read`);
    return response.data;
  },

  addReaction: async (messageId: string, data: AddReactionRequest) => {
    const response = await api.post<ApiResponse<MessageReaction>>(`/chat/messages/${messageId}/reactions`, data);
    return response.data.data;
  },

  removeReaction: async (messageId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/messages/${messageId}/reactions`);
    return response.data;
  },

  deleteMessage: async (messageId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/messages/${messageId}`);
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get<ApiResponse<{ count: number }>>('/chat/unread-count');
    return response.data;
  },

  getUserChatGames: async () => {
    const response = await api.get<ApiResponse<Game[]>>('/chat/user-games');
    return response.data;
  },

  getGameUnreadCount: async (gameId: string) => {
    const response = await api.get<ApiResponse<{ count: number }>>(`/chat/games/${gameId}/unread-count`);
    return response.data;
  },

  getGamesUnreadCounts: async (gameIds: string[]) => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/chat/games/unread-counts`, { gameIds });
    return response.data;
  },
};
