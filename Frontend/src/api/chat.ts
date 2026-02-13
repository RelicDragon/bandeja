import api from './axios';
import { ApiResponse, Game, ChatType, BasicUser } from '@/types';
import { normalizeChatType } from '@/utils/chatType';

export type { ChatType };

export type PollType = 'CLASSICAL' | 'QUIZ';

export interface PollOption {
  id: string;
  pollId: string;
  text: string;
  order: number;
  isCorrect?: boolean;
  votes: PollVote[];
  _count?: {
    votes: number;
  };
}

export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: string;
  user?: BasicUser;
}

export interface Poll {
  id: string;
  question: string;
  type: PollType;
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  options: PollOption[];
  votes: PollVote[];
  createdAt: string;
  updatedAt: string;
}

export type MessageState = 'SENT' | 'DELIVERED' | 'READ';
export type ChatContextType = 'GAME' | 'BUG' | 'USER' | 'GROUP';

const unreadCountCache = new Map<string, { data: any; timestamp: number }>();
const UNREAD_COUNT_CACHE_TTL = 1000;
let unreadCountPromise: Promise<any> | null = null;

export interface ChatMessage {
  id: string;
  chatContextType: ChatContextType;
  contextId: string;
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
  poll?: Poll;
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

export type ChatMessageWithStatus = ChatMessage & { _status?: 'SENDING' | 'FAILED'; _optimisticId?: string };

export interface LastMessagePreview {
  preview: string;
  updatedAt: string;
}

export function isLastMessagePreview(
  m: ChatMessage | LastMessagePreview | null | undefined
): m is LastMessagePreview {
  return m != null && 'preview' in m && typeof (m as LastMessagePreview).preview === 'string';
}

export function getLastMessageTime(m: ChatMessage | LastMessagePreview | null | undefined): number {
  if (!m) return 0;
  return new Date(isLastMessagePreview(m) ? m.updatedAt : (m as ChatMessage).createdAt).getTime();
}

export function getLastMessageText(m: ChatMessage | LastMessagePreview | null | undefined): string {
  if (!m) return '';
  return isLastMessagePreview(m) ? m.preview : ((m as ChatMessage).content ?? '');
}

export interface OptimisticMessagePayload {
  content: string;
  mediaUrls: string[];
  thumbnailUrls: string[];
  replyToId?: string;
  replyTo?: ChatMessage['replyTo'];
  chatType: ChatType;
  mentionIds: string[];
}

export interface CreateMessageRequest {
  chatContextType?: ChatContextType;
  contextId?: string;
  content?: string;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  replyToId?: string;
  chatType?: ChatType;
  mentionIds?: string[];
  poll?: {
    question: string;
    type: PollType;
    isAnonymous: boolean;
    allowsMultipleAnswers: boolean;
    options: string[];
    quizCorrectOptionIndex?: number;
  };
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
  user1allowed: boolean;
  user2allowed: boolean;
  createdAt: string;
  updatedAt: string;
  user1: BasicUser;
  user2: BasicUser;
  lastMessage?: ChatMessage | LastMessagePreview | null;
  isPinned?: boolean;
}

export interface GroupChannel {
  id: string;
  name: string;
  avatar?: string;
  originalAvatar?: string;
  isChannel: boolean;
  isPublic: boolean;
  participantsCount: number;
  createdAt: string;
  updatedAt: string;
  participants?: GroupChannelParticipant[];
  lastMessage?: ChatMessage | LastMessagePreview | null;
  isParticipant?: boolean;
  isOwner?: boolean;
  bugId?: string | null;
  bug?: {
    id: string;
    text: string;
    status: string;
    bugType: string;
    senderId: string;
    createdAt?: string;
    updatedAt?: string;
    sender?: BasicUser;
  };
  marketItemId?: string | null;
  marketItem?: import('@/types').MarketItem;
  buyerId?: string | null;
  buyer?: BasicUser;
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

export interface SearchMessageResult {
  message: ChatMessage;
  context: Game | UserChat | GroupChannel | { id: string; status: string; bugType: string; sender: BasicUser };
  relevanceScore?: number;
  gameEntityType?: string;
}

export interface SearchMessagesResponse {
  messages: SearchMessageResult[];
  gameMessages: SearchMessageResult[];
  channelMessages: SearchMessageResult[];
  bugMessages: SearchMessageResult[];
  marketMessages: SearchMessageResult[];
  messagesPagination: { page: number; limit: number; hasMore: boolean };
  gamePagination: { page: number; limit: number; hasMore: boolean };
  channelPagination: { page: number; limit: number; hasMore: boolean };
  bugsPagination: { page: number; limit: number; hasMore: boolean };
  marketPagination: { page: number; limit: number; hasMore: boolean };
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
    const cacheKey = 'unread-count-global';
    const cached = unreadCountCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < UNREAD_COUNT_CACHE_TTL) {
      return cached.data;
    }

    if (unreadCountPromise) {
      return unreadCountPromise;
    }

    unreadCountPromise = api.get<ApiResponse<{ count: number }>>('/chat/unread-count').then(response => {
      unreadCountCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
      setTimeout(() => {
        unreadCountCache.delete(cacheKey);
        unreadCountPromise = null;
      }, UNREAD_COUNT_CACHE_TTL);
      return response.data;
    }).catch(error => {
      unreadCountPromise = null;
      throw error;
    });

    return unreadCountPromise;
  },

  getUnreadObjects: async () => {
    const response = await api.get<ApiResponse<{
      games: Array<{ game: Game; unreadCount: number }>;
      bugs: Array<{ bug: any; unreadCount: number }>;
      userChats: Array<{ chat: UserChat; unreadCount: number }>;
      groupChannels: Array<{ groupChannel: GroupChannel; unreadCount: number }>;
      marketItems: Array<{ marketItem: any; groupChannelId: string; unreadCount: number }>;
    }>>('/chat/unread-objects');
    return response.data;
  },

  getUserChatGames: async () => {
    const response = await api.get<ApiResponse<Game[]>>('/chat/user-games');
    return response.data;
  },

  getGameParticipants: async (gameId: string) => {
    const response = await api.get<ApiResponse<import('@/types').GameParticipant[]>>(`/chat/games/${gameId}/participants`);
    return response.data.data;
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

  requestToChat: async (chatId: string) => {
    const response = await api.post<ApiResponse<ChatMessage>>(`/chat/user-chats/${chatId}/request-to-chat`);
    return response.data.data;
  },

  respondToChatRequest: async (chatId: string, messageId: string, accepted: boolean) => {
    const response = await api.post<ApiResponse<{ message: ChatMessage; userChat: UserChat }>>(
      `/chat/user-chats/${chatId}/request-to-chat/${messageId}/respond`,
      { accepted }
    );
    return response.data.data;
  },

  unpinUserChat: async (chatId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/user-chats/${chatId}/pin`);
    return response.data;
  },

  // Generic method for any context type
  getMessages: async (chatContextType: ChatContextType, contextId: string, page = 1, limit = 50, chatType: ChatType = 'PUBLIC') => {
    if (chatContextType === 'GAME') {
      return chatApi.getGameMessages(contextId, page, limit, chatType);
    } else if (chatContextType === 'USER') {
      return chatApi.getUserChatMessages(contextId, page, limit);
    } else if (chatContextType === 'GROUP') {
      return chatApi.getGroupChannelMessages(contextId, page, limit);
    }
    throw new Error(`Unsupported chat context type: ${chatContextType}`);
  },

  getGroupChannels: async (
    filter?: 'users' | 'bugs' | 'channels' | 'market',
    page?: number,
    bugsFilter?: { status?: string | null; type?: string | null; createdByMe?: boolean }
  ) => {
    const params: Record<string, string> = {};
    if (filter) params.filter = filter;
    if ((filter === 'bugs' || filter === 'users' || filter === 'channels' || filter === 'market') && page != null) params.page = String(page);
    if (filter === 'bugs' && bugsFilter) {
      if (bugsFilter.status) params.status = bugsFilter.status;
      if (bugsFilter.type) params.bugType = bugsFilter.type;
      if (bugsFilter.createdByMe) params.myBugsOnly = 'true';
    }
    const response = await api.get<ApiResponse<GroupChannel[]> & { pagination?: { page: number; limit: number; total: number; hasMore: boolean } }>('/group-channels', {
      params: Object.keys(params).length ? params : undefined
    });
    const res = response.data as any;
    return {
      data: res.data ?? [],
      pagination: res.pagination
    };
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

  updateGroupChannel: async (id: string, data: { name?: string; avatar?: string; originalAvatar?: string; isChannel?: boolean; isPublic?: boolean }) => {
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

  getGroupChannelsUnreadCounts: async (groupIds: string[]) => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/group-channels/unread-counts`, { groupIds });
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

  getMissedMessages: async (contextType: ChatContextType, contextId: string, lastMessageId?: string): Promise<ChatMessage[]> => {
    const params = new URLSearchParams({
      contextType,
      contextId
    });
    if (lastMessageId) {
      params.append('lastMessageId', lastMessageId);
    }
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/messages/missed?${params.toString()}`);
    return response.data.data ?? [];
  },

  invalidateUnreadCache: () => {
    unreadCountCache.clear();
    unreadCountPromise = null;
  },

  getUnreadCountForContext: async (contextType: ChatContextType, contextId: string): Promise<number> => {
    if (contextType === 'GAME') {
      const res = await chatApi.getGameUnreadCount(contextId);
      return res.data?.count ?? 0;
    }
    if (contextType === 'USER') {
      const res = await chatApi.getUserChatUnreadCount(contextId);
      return res.data?.count ?? 0;
    }
    if (contextType === 'GROUP') {
      const res = await chatApi.getGroupChannelUnreadCount(contextId);
      return res.data?.count ?? 0;
    }
    return 0;
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

  searchMessages: async (
    q: string,
    opts?: { section?: 'messages' | 'games' | 'channels' | 'bugs' | 'market'; messagesPage?: number; messagesLimit?: number; gamePage?: number; gameLimit?: number; bugsPage?: number; channelPage?: number; channelLimit?: number; marketPage?: number; marketLimit?: number }
  ): Promise<SearchMessagesResponse> => {
    const params = new URLSearchParams({ q });
    if (opts?.section) params.set('section', opts.section);
    if (opts?.messagesPage) params.set('messagesPage', String(opts.messagesPage));
    if (opts?.messagesLimit) params.set('messagesLimit', String(opts.messagesLimit));
    if (opts?.gamePage) params.set('gamePage', String(opts.gamePage));
    if (opts?.gameLimit) params.set('gameLimit', String(opts.gameLimit));
    if (opts?.bugsPage) params.set('bugsPage', String(opts.bugsPage));
    if (opts?.channelPage) params.set('channelPage', String(opts.channelPage));
    if (opts?.channelLimit) params.set('channelLimit', String(opts.channelLimit));
    if (opts?.marketPage) params.set('marketPage', String(opts.marketPage));
    if (opts?.marketLimit) params.set('marketLimit', String(opts.marketLimit));
    const res = await api.get<{ success: boolean } & SearchMessagesResponse>(`/chat/messages/search?${params}`);
    return res.data;
  },

  votePoll: async (pollId: string, optionIds: string[]) => {
    const response = await api.post<ApiResponse<Poll>>(`/chat/polls/${pollId}/vote`, { optionIds });
    return response.data.data;
  },
};
