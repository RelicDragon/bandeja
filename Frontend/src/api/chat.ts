import api from './axios';
import { ApiResponse, Game, ChatType, BasicUser } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

export type { ChatType };

export type MessageState = 'SENT' | 'DELIVERED' | 'READ';
export type ChatContextType = 'GAME' | 'BUG' | 'USER' | 'GROUP';

export interface ChatMessage {
  id: string;
  chatContextType: ChatContextType;
  contextId: string;
  gameId?: string | null; // Deprecated, kept for backward compatibility
  senderId: string | null;
  content: string;
  mediaUrls: string[];
  thumbnailUrls: string[];
  mentionIds: string[];
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
  sender: BasicUser | null;
  reactions: MessageReaction[];
  readReceipts: MessageReadReceipt[];
  translation?: {
    languageCode: string;
    translation: string;
  };
  translations?: Array<{
    languageCode: string;
    translation: string;
  }>;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user: BasicUser;
}

export interface MessageReadReceipt {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
  user?: BasicUser;
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
  mentionIds?: string[];
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
  user1: BasicUser;
  user2: BasicUser;
  lastMessage?: ChatMessage;
  isPinned?: boolean;
}

export interface GroupChannel {
  id: string;
  name: string;
  avatar?: string;
  isChannel: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  participants?: GroupChannelParticipant[];
  lastMessage?: ChatMessage;
  isParticipant?: boolean;
  isOwner?: boolean;
}

export interface GroupChannelParticipant {
  id: string;
  groupChannelId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'PARTICIPANT';
  joinedAt: string;
  hidden: boolean;
  user: BasicUser;
}

export interface GroupChannelInvite {
  id: string;
  groupChannelId: string;
  senderId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  message?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  sender: BasicUser;
  receiver: BasicUser;
  groupChannel: GroupChannel;
}

export interface ChatDraft {
  id: string;
  userId: string;
  chatContextType: ChatContextType;
  contextId: string;
  chatType: ChatType;
  content?: string;
  mentionIds: string[];
  updatedAt: string;
  createdAt: string;
}

export interface SaveDraftRequest {
  chatContextType: ChatContextType;
  contextId: string;
  chatType?: ChatType;
  content?: string;
  mentionIds?: string[];
}

export const chatApi = {
  createMessage: async (data: CreateMessageRequest) => {
    const normalizedData = {
      ...data,
      chatType: data.chatType ? normalizeChatType(data.chatType) : data.chatType
    };
    const response = await api.post<ApiResponse<ChatMessage>>('/chat/messages', normalizedData);
    return response.data.data;
  },

  getGameMessages: async (gameId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    const normalizedChatType = normalizeChatType(chatType);
    
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/games/${gameId}/messages`, {
      params: { page, limit, chatType: normalizedChatType }
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

  getUnreadObjects: async () => {
    const response = await api.get<ApiResponse<{
      games: Array<{ game: Game; unreadCount: number }>;
      bugs: Array<{ bug: any; unreadCount: number }>;
      userChats: Array<{ chat: UserChat; unreadCount: number }>;
      groupChannels: Array<{ groupChannel: GroupChannel; unreadCount: number }>;
    }>>('/chat/unread-objects');
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

  markAllMessagesAsReadForContext: async (contextType: ChatContextType, contextId: string, chatTypes?: ChatType[]) => {
    const response = await api.post<ApiResponse<{ count: number }>>('/chat/mark-all-read', {
      contextType,
      contextId,
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
    const normalizedChatType = normalizeChatType(chatType);
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/bugs/${bugId}/messages`, {
      params: { page, limit, chatType: normalizedChatType }
    });
    return response.data.data;
  },

  getBugLastUserMessage: async (bugId: string, chatType: ChatType = 'PUBLIC') => {
    const normalizedChatType = normalizeChatType(chatType);
    const response = await api.get<ApiResponse<ChatMessage | null>>(`/chat/bugs/${bugId}/last-user-message`, {
      params: { chatType: normalizedChatType }
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
    } else if (chatContextType === 'GROUP') {
      return chatApi.getGroupChannelMessages(contextId, page, limit);
    }
    throw new Error(`Unsupported chat context type: ${chatContextType}`);
  },

  // Group Channel Methods
  getGroupChannels: async () => {
    const response = await api.get<ApiResponse<GroupChannel[]>>('/group-channels');
    return response.data;
  },

  getPublicGroupChannels: async () => {
    const response = await api.get<ApiResponse<GroupChannel[]>>('/group-channels/public');
    return response.data;
  },

  getGroupChannelById: async (id: string) => {
    const response = await api.get<ApiResponse<GroupChannel>>(`/group-channels/${id}`);
    return response.data;
  },

  createGroupChannel: async (data: { name: string; avatar?: string; isChannel?: boolean; isPublic?: boolean }) => {
    const response = await api.post<ApiResponse<GroupChannel>>('/group-channels', data);
    return response.data;
  },

  updateGroupChannel: async (id: string, data: { name?: string; avatar?: string; isChannel?: boolean; isPublic?: boolean }) => {
    const response = await api.put<ApiResponse<GroupChannel>>(`/group-channels/${id}`, data);
    return response.data;
  },

  deleteGroupChannel: async (id: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/group-channels/${id}`);
    return response.data;
  },

  joinGroupChannel: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/group-channels/${id}/join`);
    return response.data;
  },

  leaveGroupChannel: async (id: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/group-channels/${id}/leave`);
    return response.data;
  },

  inviteUser: async (id: string, data: { receiverId: string; message?: string }) => {
    const response = await api.post<ApiResponse<GroupChannelInvite>>(`/group-channels/${id}/invite`, data);
    return response.data;
  },

  acceptInvite: async (inviteId: string) => {
    const response = await api.post<ApiResponse<{ message: string }>>(`/group-channels/invites/${inviteId}/accept`);
    return response.data;
  },

  hideGroupChannel: async (id: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/hide`);
    return response.data;
  },

  unhideGroupChannel: async (id: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/unhide`);
    return response.data;
  },

  getGroupChannelMessages: async (id: string, page = 1, limit = 50) => {
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/group-channels/${id}/messages`, {
      params: { page, limit }
    });
    return response.data.data;
  },

  getGroupChannelUnreadCount: async (id: string) => {
    const response = await api.get<ApiResponse<{ count: number }>>(`/group-channels/${id}/unread-count`);
    return response.data;
  },

  markGroupChannelAsRead: async (id: string) => {
    const response = await api.post<ApiResponse<{ count: number }>>(`/group-channels/${id}/mark-read`);
    return response.data;
  },

  getGroupChannelParticipants: async (id: string) => {
    const response = await api.get<ApiResponse<GroupChannelParticipant[]>>(`/group-channels/${id}/participants`);
    return response.data;
  },

  getGroupChannelInvites: async (id: string) => {
    const response = await api.get<ApiResponse<GroupChannelInvite[]>>(`/group-channels/${id}/invites`);
    return response.data;
  },

  promoteToAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/participants/${userId}/promote`);
    return response.data;
  },

  removeAdmin: async (id: string, userId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/participants/${userId}/remove-admin`);
    return response.data;
  },

  removeParticipant: async (id: string, userId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/participants/${userId}`);
    return response.data;
  },

  transferOwnership: async (id: string, newOwnerId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>(`/group-channels/${id}/transfer-ownership`, { newOwnerId });
    return response.data;
  },

  cancelInvite: async (inviteId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/group-channels/invites/${inviteId}`);
    return response.data;
  },

  reportMessage: async (messageId: string, data: { reason: string; description?: string }) => {
    const response = await api.post<ApiResponse<any>>(`/chat/messages/${messageId}/report`, data);
    return response.data;
  },

  // Chat Mute Methods
  muteChat: async (chatContextType: ChatContextType, contextId: string) => {
    const response = await api.post<ApiResponse<any>>('/chat/mute', {
      chatContextType,
      contextId
    });
    return response.data;
  },

  unmuteChat: async (chatContextType: ChatContextType, contextId: string) => {
    const response = await api.post<ApiResponse<{ success: boolean }>>('/chat/unmute', {
      chatContextType,
      contextId
    });
    return response.data;
  },

  isChatMuted: async (chatContextType: ChatContextType, contextId: string) => {
    const response = await api.get<ApiResponse<{ isMuted: boolean }>>('/chat/mute-status', {
      params: { chatContextType, contextId }
    });
    return response.data.data;
  },

  confirmMessageReceipt: async (messageId: string, deliveryMethod: 'socket' | 'push') => {
    const response = await api.post<ApiResponse<{ success: boolean }>>('/chat/messages/confirm-receipt', {
      messageId,
      deliveryMethod
    });
    return response.data;
  },

  getMissedMessages: async (contextType: ChatContextType, contextId: string, lastMessageId?: string) => {
    const params = new URLSearchParams({
      contextType,
      contextId
    });
    if (lastMessageId) {
      params.append('lastMessageId', lastMessageId);
    }
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/messages/missed?${params.toString()}`);
    return response.data;
  },

  translateMessage: async (messageId: string) => {
    const response = await api.post<ApiResponse<{ translation: string; languageCode: string }>>(
      `/chat/messages/${messageId}/translate`
    );
    return response.data.data;
  },

  saveDraft: async (data: SaveDraftRequest) => {
    const response = await api.post<ApiResponse<ChatDraft>>('/chat/drafts', {
      ...data,
      chatType: data.chatType ? normalizeChatType(data.chatType) : 'PUBLIC'
    });
    return response.data.data;
  },

  getDraft: async (chatContextType: ChatContextType, contextId: string, chatType: ChatType = 'PUBLIC') => {
    const normalizedChatType = normalizeChatType(chatType);
    const response = await api.get<ApiResponse<ChatDraft | null>>('/chat/drafts', {
      params: { chatContextType, contextId, chatType: normalizedChatType }
    });
    return response.data.data;
  },

  getUserDrafts: async (page: number = 1, limit: number = 50) => {
    const response = await api.get<ApiResponse<ChatDraft[]>>('/chat/drafts/all', {
      params: { page, limit }
    });
    return {
      drafts: response.data.data,
      pagination: (response.data as any).pagination
    };
  },

  deleteDraft: async (chatContextType: ChatContextType, contextId: string, chatType: ChatType = 'PUBLIC') => {
    const normalizedChatType = normalizeChatType(chatType);
    const response = await api.delete<ApiResponse<void>>('/chat/drafts', {
      data: { chatContextType, contextId, chatType: normalizedChatType }
    });
    return response.data;
  },
};
