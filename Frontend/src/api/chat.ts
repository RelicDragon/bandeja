import api from './axios';
import { ApiResponse, Game, ChatType, BasicUser } from '@/types';
import type { UnreadObjectsApiPayload } from '@/services/chat/chatUnreadPayload';
import { normalizeChatType } from '@/utils/chatType';
import { withChatSyncRetry, withMessageCreateRetry } from '@/services/chat/chatHttpRetry';
import type { ReactionEmojiUsageMutationPayload } from '@/store/reactionEmojiUsageStore';

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
export type MessageType = 'TEXT' | 'IMAGE' | 'VOICE' | 'POLL';

const unreadCountCache = new Map<string, { data: any; timestamp: number }>();
const UNREAD_COUNT_CACHE_TTL = 1000;
let unreadCountPromise: Promise<any> | null = null;

let unreadObjectsInFlight: Promise<ApiResponse<UnreadObjectsApiPayload>> | null = null;
const UNREAD_OBJECTS_IN_FLIGHT_TTL_MS = 1800;

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
  messageType?: MessageType;
  audioDurationMs?: number | null;
  waveformData?: number[];
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string;
  replyTo?: {
    id: string;
    content: string;
    messageType?: MessageType;
    mediaUrls?: string[];
    audioDurationMs?: number | null;
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
  audioTranscription?: {
    transcription: string;
    languageCode: string | null;
  };
  poll?: Poll;
  clientMutationId?: string | null;
  /** Server conversation sync sequence when known (socket / sync log). */
  syncSeq?: number;
  /** DB column; preferred for ordering when applying sync events (avoids max() with bogus local syncSeq). */
  serverSyncSeq?: number | null;
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

export type ChatMessageWithStatus = ChatMessage & {
  _status?: 'SENDING' | 'FAILED';
  _optimisticId?: string;
  _clientMutationId?: string;
};

export interface LastMessagePreview {
  preview: string;
  updatedAt: string;
  senderId?: string | null;
  sender?: BasicUser | null;
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
  messageType?: MessageType;
  audioDurationMs?: number;
  waveformData?: number[];
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
  messageType?: MessageType;
  audioDurationMs?: number;
  waveformData?: number[];
  clientMutationId?: string;
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
  pinnedAt?: string | null;
  isMuted?: boolean;
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
    priority?: number;
    senderId: string;
    createdAt?: string;
    updatedAt?: string;
    sender?: BasicUser;
  };
  marketItemId?: string | null;
  marketItem?: import('@/types').MarketItem;
  buyerId?: string | null;
  buyer?: BasicUser;
  isPinned?: boolean;
  pinnedAt?: string | null;
  isCityGroup?: boolean;
  isMuted?: boolean;
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
  fromLocalCache?: boolean;
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

export interface GetUserDraftsResponse {
  data: ChatDraft[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const chatApi = {
  createMessage: async (data: CreateMessageRequest) => {
    const normalizedData = {
      ...data,
      chatType: data.chatType ? normalizeChatType(data.chatType) : data.chatType
    };
    return withMessageCreateRetry(() =>
      api
        .post<ApiResponse<ChatMessage>>('/chat/messages', normalizedData, { timeout: 55_000 })
        .then((response) => response.data.data)
    );
  },

  editMessage: async (
    messageId: string,
    body: { content: string; mentionIds?: string[]; clientMutationId?: string }
  ) => {
    const response = await api.patch<ApiResponse<ChatMessage>>(`/chat/messages/${messageId}`, body);
    return response.data.data;
  },

  getBugMessages: async (bugId: string, page = 1, limit = 50, beforeMessageId?: string) => {
    const params: Record<string, string | number> = { page, limit };
    if (beforeMessageId) params.beforeMessageId = beforeMessageId;
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/bugs/${bugId}/messages`, { params });
    return response.data.data;
  },

  getGameMessages: async (
    gameId: string,
    page = 1,
    limit = 50,
    chatType: ChatType = 'PUBLIC',
    beforeMessageId?: string
  ) => {
    const normalizedChatType = normalizeChatType(chatType);
    const params: Record<string, string | number> = { page, limit, chatType: normalizedChatType };
    if (beforeMessageId) params.beforeMessageId = beforeMessageId;
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/games/${gameId}/messages`, { params });
    return response.data.data;
  },

  updateMessageState: async (messageId: string, data: UpdateMessageStateRequest) => {
    const response = await api.patch<ApiResponse<void>>(`/chat/messages/${messageId}/state`, data);
    return response.data;
  },

  addReaction: async (messageId: string, data: AddReactionRequest & { clientMutationId?: string }) => {
    const response = await api.post<ApiResponse<MessageReaction & { emojiUsage: ReactionEmojiUsageMutationPayload }>>(
      `/chat/messages/${messageId}/reactions`,
      data
    );
    const raw = response.data.data;
    if (raw && typeof raw === 'object' && 'emojiUsage' in raw && raw.emojiUsage) {
      const { emojiUsage, ...reaction } = raw;
      return { reaction: reaction as MessageReaction, emojiUsage };
    }
    return {
      reaction: raw as MessageReaction,
      emojiUsage: { version: 0, touched: null } satisfies ReactionEmojiUsageMutationPayload,
    };
  },

  removeReaction: async (messageId: string, clientMutationId?: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/messages/${messageId}/reactions`, {
      params: clientMutationId ? { clientMutationId } : undefined,
    });
    return response.data;
  },

  deleteMessage: async (messageId: string, clientMutationId?: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/chat/messages/${messageId}`, {
      params: clientMutationId ? { clientMutationId } : undefined,
    });
    return response.data;
  },

  getChatMessageById: async (messageId: string): Promise<ChatMessage> => {
    const response = await api.get<ApiResponse<ChatMessage>>(`/chat/messages/${messageId}`);
    return response.data.data;
  },

  getPinnedMessages: async (
    contextType: ChatContextType,
    contextId: string,
    chatType: ChatType = 'PUBLIC'
  ): Promise<ChatMessage[]> => {
    const response = await api.get<ApiResponse<ChatMessage[]>>('/chat/pinned-messages', {
      params: { contextType, contextId, chatType: normalizeChatType(chatType) }
    });
    return response.data.data;
  },

  pinMessage: async (messageId: string, clientMutationId?: string) => {
    const response = await api.post<ApiResponse<{ pinned: boolean }>>(`/chat/messages/${messageId}/pin`, {
      ...(clientMutationId ? { clientMutationId } : {}),
    });
    return response.data;
  },

  unpinMessage: async (messageId: string, clientMutationId?: string) => {
    const response = await api.delete<ApiResponse<{ pinned: boolean }>>(`/chat/messages/${messageId}/pin`, {
      params: clientMutationId ? { clientMutationId } : undefined,
    });
    return response.data;
  },

  postChatListRowPreviews: async (payload: { groupChannelIds: string[]; userChatIds: string[] }) => {
    const response = await api.post<
      ApiResponse<{ groupChannels: Record<string, ChatMessage>; userChats: Record<string, ChatMessage> }>
    >('/chat/list-row-previews', payload);
    const raw = response.data as ApiResponse<{
      groupChannels: Record<string, ChatMessage>;
      userChats: Record<string, ChatMessage>;
    }> & { groupChannels?: unknown; userChats?: unknown };
    const d = raw.data;
    if (d && typeof d === 'object' && ('groupChannels' in d || 'userChats' in d)) {
      return {
        groupChannels: (d as { groupChannels?: Record<string, ChatMessage> }).groupChannels ?? {},
        userChats: (d as { userChats?: Record<string, ChatMessage> }).userChats ?? {},
      };
    }
    return { groupChannels: {}, userChats: {} };
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
    if (unreadObjectsInFlight) return unreadObjectsInFlight;
    unreadObjectsInFlight = api
      .get<ApiResponse<UnreadObjectsApiPayload>>('/chat/unread-objects')
      .then((response) => response.data)
      .catch((error) => {
        unreadObjectsInFlight = null;
        throw error;
      });
    const data = await unreadObjectsInFlight;
    setTimeout(() => {
      unreadObjectsInFlight = null;
    }, UNREAD_OBJECTS_IN_FLIGHT_TTL_MS);
    return data;
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

  getGamesUnreadCounts: async (gameIds: string[]): Promise<Record<string, number>> => {
    const response = await api.post<ApiResponse<Record<string, number>>>(`/chat/games/unread-counts`, { gameIds });
    const body = response.data as ApiResponse<Record<string, number>> & Record<string, number>;
    return (body?.data != null ? body.data : body) ?? {};
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

  getUserChatMessages: async (chatId: string, page = 1, limit = 50, beforeMessageId?: string) => {
    const params: Record<string, string | number> = { page, limit };
    if (beforeMessageId) params.beforeMessageId = beforeMessageId;
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/user-chats/${chatId}/messages`, { params });
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

  pinGroupChannel: async (channelId: string) => {
    const response = await api.post<ApiResponse<{ id: string; pinnedAt: string }>>(`/group-channels/${channelId}/pin`);
    return response.data;
  },

  unpinGroupChannel: async (channelId: string) => {
    const response = await api.delete<ApiResponse<{ success: boolean }>>(`/group-channels/${channelId}/pin`);
    return response.data;
  },

  getMessages: async (
    chatContextType: ChatContextType,
    contextId: string,
    page = 1,
    limit = 50,
    chatType: ChatType = 'PUBLIC',
    beforeMessageId?: string
  ) => {
    if (chatContextType === 'GAME') {
      return chatApi.getGameMessages(contextId, page, limit, chatType, beforeMessageId);
    } else if (chatContextType === 'BUG') {
      return chatApi.getBugMessages(contextId, page, limit, beforeMessageId);
    } else if (chatContextType === 'USER') {
      return chatApi.getUserChatMessages(contextId, page, limit, beforeMessageId);
    } else if (chatContextType === 'GROUP') {
      return chatApi.getGroupChannelMessages(contextId, page, limit, beforeMessageId);
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

  getGroupChannelMessages: async (id: string, page = 1, limit = 50, beforeMessageId?: string) => {
    const params: Record<string, string | number> = { page, limit };
    if (beforeMessageId) params.beforeMessageId = beforeMessageId;
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/group-channels/${id}/messages`, { params });
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

  getChatTranslationPreference: async (chatContextType: ChatContextType, contextId: string) => {
    const response = await api.get<ApiResponse<{ translateToLanguage: string | null }>>('/chat/translation-preference', {
      params: { chatContextType, contextId }
    });
    return response.data.data?.translateToLanguage ?? null;
  },

  setChatTranslationPreference: async (chatContextType: ChatContextType, contextId: string, translateToLanguage: string | null) => {
    const response = await api.put<ApiResponse<{ translateToLanguage: string | null }>>('/chat/translation-preference', {
      chatContextType,
      contextId,
      translateToLanguage
    });
    return response.data.data?.translateToLanguage ?? null;
  },

  confirmMessageReceipt: async (messageId: string, deliveryMethod: 'socket' | 'push') => {
    const response = await api.post<ApiResponse<{ success: boolean }>>('/chat/messages/confirm-receipt', {
      messageId,
      deliveryMethod
    });
    return response.data;
  },

  getMissedMessages: async (
    contextType: ChatContextType,
    contextId: string,
    lastMessageId?: string,
    gameChatType?: ChatType
  ): Promise<ChatMessage[]> => {
    const params = new URLSearchParams({
      contextType,
      contextId
    });
    if (lastMessageId) {
      params.append('lastMessageId', lastMessageId);
    }
    if (contextType === 'GAME' && gameChatType) {
      params.append('chatType', normalizeChatType(gameChatType));
    }
    const response = await api.get<ApiResponse<ChatMessage[]>>(`/chat/messages/missed?${params.toString()}`);
    return response.data.data ?? [];
  },

  invalidateUnreadCache: () => {
    unreadCountCache.clear();
    unreadCountPromise = null;
    unreadObjectsInFlight = null;
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

  transcribeMessage: async (messageId: string) => {
    const response = await api.post<ApiResponse<{ transcription: string; languageCode: string | null }>>(
      `/chat/messages/${messageId}/transcribe`
    );
    return response.data.data;
  },

  translateDraft: async (text: string, languageCode: string) => {
    const response = await api.post<ApiResponse<{ translation: string; languageCode: string }>>(
      '/chat/translate-draft',
      { text: text.trim(), languageCode }
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
    const response = await api.get<ApiResponse<ChatDraft[]> & { pagination: GetUserDraftsResponse['pagination'] }>(
      '/chat/drafts/all',
      { params: { page, limit } }
    );
    const body = response.data;
    return {
      drafts: body.data,
      pagination: body.pagination
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

  getChatSyncHead: async (contextType: ChatContextType, contextId: string): Promise<number> => {
    return withChatSyncRetry('head', () =>
      api
        .get<ApiResponse<{ maxSeq: number }>>('/chat/sync/head', {
          params: { contextType, contextId },
          timeout: 25_000,
        })
        .then((response) => response.data.data.maxSeq)
    );
  },

  getChatSyncEvents: async (
    contextType: ChatContextType,
    contextId: string,
    afterSeq: number,
    limit = 200
  ): Promise<{
    events: Array<{ id: string; seq: number; eventType: string; payload: unknown; createdAt: string }>;
    hasMore: boolean;
    oldestRetainedSeq?: number | null;
    cursorStale?: boolean;
  }> => {
    return withChatSyncRetry('events', () =>
      api
        .get<
          ApiResponse<{
            events: Array<{ id: string; seq: number; eventType: string; payload: unknown; createdAt: string }>;
            hasMore: boolean;
            oldestRetainedSeq?: number | null;
            cursorStale?: boolean;
          }>
        >('/chat/sync/events', {
          params: { contextType, contextId, afterSeq, limit },
          timeout: 55_000,
        })
        .then((response) => response.data.data)
    );
  },

  postChatSyncBatchHead: async (
    items: Array<{ contextType: ChatContextType; contextId: string }>
  ): Promise<Record<string, number>> => {
    return withChatSyncRetry('batch-head', () =>
      api
        .post<ApiResponse<Record<string, number>>>('/chat/sync/batch-head', { items }, { timeout: 35_000 })
        .then((response) => response.data.data)
    );
  },
};
