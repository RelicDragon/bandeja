import api from './axios';
import { ApiResponse, Bug, ChatType } from '@/types';

export type MessageState = 'SENT' | 'DELIVERED' | 'READ';

export interface BugMessage {
  id: string;
  bugId: string;
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
  reactions: BugMessageReaction[];
  readReceipts: BugMessageReadReceipt[];
}

export interface BugMessageReaction {
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

export interface BugMessageReadReceipt {
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

export interface CreateBugMessageRequest {
  bugId: string;
  content?: string;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  replyToId?: string;
  chatType?: ChatType;
}

export interface UpdateBugMessageStateRequest {
  state: MessageState;
}

export interface AddBugReactionRequest {
  emoji: string;
}

export const bugChatApi = {
  createMessage: async (data: CreateBugMessageRequest) => {
    const response = await api.post<ApiResponse<BugMessage>>('/bug-chat/messages', data);
    return response.data.data;
  },

  getBugMessages: async (bugId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    const response = await api.get<ApiResponse<BugMessage[]>>(`/bug-chat/bugs/${bugId}/messages`, {
      params: { page, limit, chatType }
    });
    return response.data.data;
  },

  updateMessageState: async (messageId: string, data: UpdateBugMessageStateRequest) => {
    const response = await api.patch<ApiResponse<void>>(`/bug-chat/messages/${messageId}/state`, data);
    return response.data;
  },

  markMessageAsRead: async (messageId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/bug-chat/messages/${messageId}/read`);
    return response.data;
  },

  addReaction: async (messageId: string, data: AddBugReactionRequest) => {
    const response = await api.post<ApiResponse<BugMessageReaction>>(`/bug-chat/messages/${messageId}/reactions`, data);
    return response.data.data;
  },

  removeReaction: async (messageId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/bug-chat/messages/${messageId}/reactions`);
    return response.data;
  },

  deleteMessage: async (messageId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/bug-chat/messages/${messageId}`);
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get<ApiResponse<{ count: number }>>('/bug-chat/unread-count');
    return response.data;
  },

  getUserBugChats: async () => {
    const response = await api.get<ApiResponse<Bug[]>>('/bug-chat/user-bugs');
    return response.data;
  },

  getBugUnreadCount: async (bugId: string) => {
    const response = await api.get<ApiResponse<{ count: number }>>(`/bug-chat/bugs/${bugId}/unread-count`);
    return response.data;
  },

  getBugsUnreadCounts: async (bugIds: string[]) => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/bug-chat/bugs/unread-counts`, { bugIds });
    return response.data;
  },
};
