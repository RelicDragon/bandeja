import api from './axios';
import { ApiResponse, Game, ChatType } from '@/types';

export type MessageState = 'SENT' | 'DELIVERED' | 'READ';
export type ChatContextType = 'GAME' | 'BUG' | 'USER';

export interface ChatMessage {
  id: string;
  chatContextType: ChatContextType;
  contextId: string;
  gameId?: string | null; // Deprecated, kept for backward compatibility
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
  chatContextType?: ChatContextType;
  contextId?: string;
  gameId?: string; // Deprecated, kept for backward compatibility
  content?: string;
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

export interface UserChat {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  updatedAt: string;
  user1: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  };
  user2: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
  };
  lastMessage?: ChatMessage;
  isPinned?: boolean;
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

  markAllMessagesAsRead: async (gameId: string, chatTypes?: ChatType[]) => {
    const response = await api.post<ApiResponse<{ count: number }>>(`/chat/games/${gameId}/mark-all-read`, { 
      chatTypes: chatTypes || [] 
    });
    return response.data;
  },

  // User Chat Methods
  getUserChats: async () => {
    const response = await api.get<ApiResponse<UserChat[]>>('/chat/user-chats');
    return response.data;
  },

  getOrCreateChatWithUser: async (userId: string) => {
    const response = await api.get<ApiResponse<UserChat>>(`/chat/user-chats/with/${userId}`);
    return response.data;
  },

  getUserChatMessages: async (chatId: string, page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/user-chats/${chatId}/messages`, {
      params: { page, limit }
    });
    return response.data.data;
  },

  getUserChatUnreadCount: async (chatId: string) => {
    const response = await api.get<ApiResponse<{ count: number }>>(`/chat/user-chats/${chatId}/unread-count`);
    return response.data;
  },

  getUserChatsUnreadCounts: async (chatIds: string[]) => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/chat/user-chats/unread-counts`, { chatIds });
    return response.data;
  },

  markUserChatAsRead: async (chatId: string) => {
    const response = await api.post<ApiResponse<{ count: number }>>(`/chat/user-chats/${chatId}/mark-all-read`);
    return response.data;
  },

  pinUserChat: async (chatId: string) => {
    const response = await api.post<ApiResponse<any>>(`/chat/user-chats/${chatId}/pin`);
    return response.data;
  },

  unpinUserChat: async (chatId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/user-chats/${chatId}/pin`);
    return response.data;
  },

  // Bug Chat Methods
  getBugMessages: async (bugId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/bugs/${bugId}/messages`, {
      params: { page, limit, chatType }
    });
    return response.data.data;
  },

  getBugUnreadCount: async (bugId: string) => {
    const response = await api.get<ApiResponse<{ count: number }>>(`/chat/bugs/${bugId}/unread-count`);
    return response.data;
  },

  getBugsUnreadCounts: async (bugIds: string[]) => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/chat/bugs/unread-counts`, { bugIds });
    return response.data;
  },

  markAllBugMessagesAsRead: async (bugId: string) => {
    const response = await api.post<ApiResponse<{ count: number }>>(`/chat/bugs/${bugId}/mark-all-read`);
    return response.data;
  },

  // Generic method for any context type
  getMessages: async (chatContextType: ChatContextType, contextId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    if (chatContextType === 'GAME') {
      return chatApi.getGameMessages(contextId, page, limit, chatType);
    } else if (chatContextType === 'USER') {
      return chatApi.getUserChatMessages(contextId, page, limit);
    } else if (chatContextType === 'BUG') {
      return chatApi.getBugMessages(contextId, page, limit, chatType);
    }
    throw new Error(`Unsupported chat context type: ${chatContextType}`);
  },

  reportMessage: async (messageId: string, data: { reason: string; description?: string }) => {
    const response = await api.post<ApiResponse<any>>(`/chat/messages/${messageId}/report`, data);
    return response.data;
  },
};
