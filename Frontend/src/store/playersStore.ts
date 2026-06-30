import { create } from 'zustand';
import { chatApi, type ChatMessage, UserChat } from '@/api/chat';
import { usersApi, type InvitablePlayer } from '@/api/users';
import { useAuthStore } from './authStore';
import { useUnreadStore } from '@/store/unreadStore';
import { useSocketEventsStore } from './socketEventsStore';
import { BasicUser } from '@/types';
import { mergeInvitablePlayer } from '@/utils/mergeInvitablePlayer';
import type { NewUserChatMessage, UserChatReadReceipt } from '@/services/socketService';
import { warmChatSyncHeads } from '@/services/chat/chatSyncBatchWarm';
import {
  pruneThreadIndexUserChatsNotIn,
  syncUserThreadIndexFromUnreadMap,
} from '@/services/chat/chatThreadIndex';
import { bridgeBumpChatListDexie } from '@/services/chat/chatLocalApplyStoreBridge';

export interface UserMetadata {
  chatId?: string;
  interactionCount: number;
  gamesTogetherCount: number;
  lastInteractionAt?: number;
  isFavorite?: boolean;
  isBlocked?: boolean;
  lastFetchedAt: number;
}

interface UsersState {
  users: Record<string, BasicUser>;
  metadata: Record<string, UserMetadata>;
  chats: Record<string, UserChat>;
  userIdToChatId: Record<string, string>;
  loading: boolean;
  chatsLoading: boolean;
  isFetching: boolean;
  isFetchingChats: boolean;
  lastPlayersFetchTime: number;
  lastChatsFetchTime: number;
  invitableMaxSocialLevel: number | null;
  
  getUser: (userId: string) => BasicUser | undefined;
  getUserMetadata: (userId: string) => UserMetadata | undefined;
  getUserWithMetadata: (userId: string) => (BasicUser & Partial<UserMetadata>) | undefined;
  setUser: (user: BasicUser) => void;
  setUsers: (users: BasicUser[]) => void;
  updateUserMetadata: (userId: string, metadata: Partial<UserMetadata>) => void;
  incrementInteractionCount: (userId: string) => void;
  
  getChatByUserId: (userId: string) => UserChat | undefined;
  getChatById: (chatId: string) => UserChat | undefined;
  patchUserChatPreview: (chatId: string, lastMessage: ChatMessage, updatedAt: string) => void;
  addChat: (chat: UserChat) => Promise<void>;
  getOrCreateAndAddUserChat: (userId: string) => Promise<UserChat | null>;

  fetchPlayers: (gameId?: string, sport?: string, search?: string) => Promise<BasicUser[]>;
  fetchUserChats: () => Promise<void>;
  invalidateUserChatsCache: () => void;
  refresh: () => Promise<void>;
  invalidatePlayersCache: () => void;
  clear: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000;
let initSubscribed = false;
let socketSubscriptionsSetup = false;
let newMessageHandler: ((message: NewUserChatMessage) => void) | null = null;
let readReceiptHandler: ((readReceipt: UserChatReadReceipt) => void) | null = null;
let unifiedMessageHandler: (() => void) | null = null;
let unifiedReadReceiptHandler: (() => void) | null = null;
let cleanupPromise: Promise<void> | null = null;
const fetchPlayersInflight = new Map<string, Promise<BasicUser[]>>();

function fetchPlayersCacheKey(gameId?: string, sport?: string, search?: string): string {
  return `${gameId ?? ''}:${sport ?? ''}:${search?.trim() ?? ''}`;
}

const createDefaultMetadata = (existing?: Partial<UserMetadata>): UserMetadata => ({
  interactionCount: 0,
  gamesTogetherCount: 0,
  lastFetchedAt: Date.now(),
  ...existing,
});

const setupSocketSubscriptions = () => {
  if (socketSubscriptionsSetup) return;
  socketSubscriptionsSetup = true;

  newMessageHandler = (message: NewUserChatMessage) => {
    const store = usePlayersStore.getState();
    const chat = store.getChatById(message.contextId);
    if (chat) {
      usePlayersStore.setState((state) => ({
        chats: {
          ...state.chats,
          [chat.id]: {
            ...state.chats[chat.id],
            lastMessage: message as any,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    } else {
      store.fetchUserChats();
    }
  };

  readReceiptHandler = () => {
    // Unread counts: unreadStore socket deltas + snapshot.
  };

  let prevUserMsgQLen = 0;
  let prevUserReadQLen = 0;
  unifiedMessageHandler = useSocketEventsStore.subscribe((state) => {
    const len = state.userChatMessageQueue.length;
    if (len <= prevUserMsgQLen) return;
    prevUserMsgQLen = len;
    const batch = useSocketEventsStore.getState().takeUserChatMessages();
    for (const item of batch) {
      if (item.contextType === 'USER' && newMessageHandler) newMessageHandler(item.message);
    }
    prevUserMsgQLen = useSocketEventsStore.getState().userChatMessageQueue.length;
  });

  unifiedReadReceiptHandler = useSocketEventsStore.subscribe((state) => {
    const len = state.userChatReadReceiptQueue.length;
    if (len <= prevUserReadQLen) return;
    prevUserReadQLen = len;
    const batch = useSocketEventsStore.getState().takeUserChatReadReceipts();
    for (const item of batch) {
      if (item.contextType === 'USER' && readReceiptHandler) readReceiptHandler(item.readReceipt);
    }
    prevUserReadQLen = useSocketEventsStore.getState().userChatReadReceiptQueue.length;
  });
};

const cleanupSocketSubscriptions = () => {
  if (!socketSubscriptionsSetup) return;
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = Promise.resolve().then(() => {
    // Clean up unified event listeners (Zustand subscriptions)
    if (unifiedMessageHandler) {
      unifiedMessageHandler();
      unifiedMessageHandler = null;
    }
    if (unifiedReadReceiptHandler) {
      unifiedReadReceiptHandler();
      unifiedReadReceiptHandler = null;
    }
    socketSubscriptionsSetup = false;
    cleanupPromise = null;
  });

  return cleanupPromise;
};

const initializeStore = () => {
  if (initSubscribed) return;
  initSubscribed = true;

  useAuthStore.subscribe((state) => {
    const hasSession = !!(state.token && state.user?.id);
    if (hasSession) {
      usePlayersStore.getState().fetchUserChats();
      setupSocketSubscriptions();
    } else if (!state.token && !state.user) {
      usePlayersStore.getState().clear();
      cleanupSocketSubscriptions();
    }
  });

  const snap = useAuthStore.getState();
  if (snap.token && snap.user?.id) {
    usePlayersStore.getState().fetchUserChats();
    setupSocketSubscriptions();
  }
};

export const usePlayersStore = create<UsersState>((set, get) => ({
  users: {},
  metadata: {},
  chats: {},
  userIdToChatId: {},
  loading: false,
  chatsLoading: false,
  isFetching: false,
  isFetchingChats: false,
  lastPlayersFetchTime: 0,
  lastChatsFetchTime: 0,
  invitableMaxSocialLevel: null,

  getUser: (userId: string) => {
    return get().users[userId];
  },

  getUserMetadata: (userId: string) => {
    return get().metadata[userId];
  },

  getUserWithMetadata: (userId: string) => {
    const user = get().users[userId];
    const metadata = get().metadata[userId];
    if (!user) return undefined;
    return { ...user, ...metadata };
  },

  setUser: (user: BasicUser) => {
    set((state) => ({
      users: {
        ...state.users,
        [user.id]: user,
      },
      metadata: {
        ...state.metadata,
        [user.id]: createDefaultMetadata(state.metadata[user.id]),
      },
    }));
  },

  setUsers: (users: BasicUser[]) => {
    const now = Date.now();
    set((state) => {
      const newUsers: Record<string, BasicUser> = {};
      const newMetadata: Record<string, UserMetadata> = {};

      users.forEach((user) => {
        newUsers[user.id] = user;
        newMetadata[user.id] = createDefaultMetadata({
          ...state.metadata[user.id],
          lastFetchedAt: now,
        });
      });

      return {
        users: { ...state.users, ...newUsers },
        metadata: { ...state.metadata, ...newMetadata },
      };
    });
  },

  updateUserMetadata: (userId: string, metadata: Partial<UserMetadata>) => {
    set((state) => ({
      metadata: {
        ...state.metadata,
        [userId]: createDefaultMetadata({
          ...state.metadata[userId],
          ...metadata,
        }),
      },
    }));
  },

  incrementInteractionCount: (userId: string) => {
    set((state) => {
      const currentMetadata = state.metadata[userId];
      const currentCount = currentMetadata?.interactionCount || 0;
      
      return {
        metadata: {
          ...state.metadata,
          [userId]: createDefaultMetadata({
            ...state.metadata[userId],
            interactionCount: currentCount + 1,
            lastInteractionAt: Date.now(),
          }),
        },
      };
    });
  },

  getChatByUserId: (userId: string) => {
    const state = get();
    const chatId = state.userIdToChatId[userId];
    if (!chatId) return undefined;
    return state.chats[chatId];
  },

  getChatById: (chatId: string) => {
    const state = get();
    return state.chats[chatId];
  },

  patchUserChatPreview: (chatId: string, lastMessage: ChatMessage, updatedAt: string) => {
    set((state) => {
      const cur = state.chats[chatId];
      if (!cur) return state;
      return {
        chats: {
          ...state.chats,
          [chatId]: { ...cur, lastMessage, updatedAt },
        },
      };
    });
  },

  addChat: async (chat: UserChat) => {
    const currentUserId = useAuthStore.getState().user?.id;
    if (!currentUserId) return;

    const otherUserId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
    const otherUser = chat.user1Id === currentUserId ? chat.user2 : chat.user1;

    if (!otherUser || !otherUserId) return;

    set((state) => {
      const newMetadata: Record<string, UserMetadata> = { ...state.metadata };
      
      newMetadata[otherUserId] = createDefaultMetadata({
        ...state.metadata[otherUserId],
        chatId: chat.id,
      });

      return {
        chats: {
          ...state.chats,
          [chat.id]: chat,
        },
        userIdToChatId: {
          ...state.userIdToChatId,
          [otherUserId]: chat.id,
        },
        users: {
          ...state.users,
          [otherUserId]: otherUser,
        },
        metadata: newMetadata,
      };
    });

    try {
      const unreadResponse = await chatApi.getUserChatsUnreadCounts([chat.id]);
      const n = unreadResponse.data?.[chat.id];
      if (n != null && n > 0) {
        useUnreadStore.getState().applySocketDelta({
          contextType: 'USER',
          contextId: chat.id,
          unreadCount: n,
        });
        syncUserThreadIndexFromUnreadMap({ [chat.id]: n });
      }
    } catch (error) {
      console.error('Failed to fetch unread count for new chat:', error);
    }
  },

  getOrCreateAndAddUserChat: async (userId: string): Promise<UserChat | null> => {
    try {
      const response = await chatApi.getOrCreateChatWithUser(userId);
      const chat = response?.data;
      if (!chat) return null;
      const { addChat } = get();
      await addChat(chat);
      return chat;
    } catch (error) {
      console.error('Failed to get or create user chat:', error);
      return null;
    }
  },

  fetchPlayers: async (gameId?: string, sport?: string, search?: string): Promise<BasicUser[]> => {
    const normalizedSearch = search?.trim();
    const cacheKey = fetchPlayersCacheKey(gameId, sport, normalizedSearch);
    const inflight = fetchPlayersInflight.get(cacheKey);
    if (inflight) return inflight;

    const run = async (): Promise<BasicUser[]> => {
    const state = get();
    const now = Date.now();

    const cacheValid =
      !gameId &&
      !sport &&
      !normalizedSearch &&
      state.lastPlayersFetchTime > 0 &&
      now - state.lastPlayersFetchTime < CACHE_DURATION;
    if (cacheValid) {
      return Object.values(state.users);
    }

    set({ loading: true, isFetching: true });
    try {
      const response = await usersApi.getInvitablePlayers(gameId, sport, normalizedSearch);
      const payload = response.data;
      const players = payload?.players ?? [];
      const maxSocialLevel = payload?.maxSocialLevel ?? null;

      set((currentState) => {
        const newUsers: Record<string, BasicUser> = {};
        const newMetadata: Record<string, UserMetadata> = {};

        players.forEach((player: InvitablePlayer) => {
          newUsers[player.id] = mergeInvitablePlayer(currentState.users[player.id], player);
          newMetadata[player.id] = createDefaultMetadata({
            ...currentState.metadata[player.id],
            interactionCount: player.interactionCount,
            gamesTogetherCount: player.gamesTogetherCount,
            lastFetchedAt: now,
          });
        });

        const isGlobalCacheFetch = !gameId && !sport && !normalizedSearch;

        return {
          users: { ...currentState.users, ...newUsers },
          metadata: { ...currentState.metadata, ...newMetadata },
          lastPlayersFetchTime: isGlobalCacheFetch ? now : currentState.lastPlayersFetchTime,
          loading: false,
          isFetching: false,
          invitableMaxSocialLevel: maxSocialLevel,
        };
      });
      const { users: mergedUsers } = get();
      return players.map((p) => mergedUsers[p.id] ?? p);
    } catch (error) {
      console.error('Failed to fetch players:', error);
      set({ loading: false, isFetching: false });
      return [];
    }
    };

    const promise = run().finally(() => {
      if (fetchPlayersInflight.get(cacheKey) === promise) {
        fetchPlayersInflight.delete(cacheKey);
      }
    });
    fetchPlayersInflight.set(cacheKey, promise);
    return promise;
  },

  fetchUserChats: async () => {
    const state = get();
    const now = Date.now();

    if (state.isFetchingChats) {
      return;
    }

    const cacheValid = state.lastChatsFetchTime > 0 && now - state.lastChatsFetchTime < CACHE_DURATION;
    if (cacheValid) {
      return;
    }

    set({ chatsLoading: true, isFetchingChats: true });
    try {
      const response = await chatApi.getUserChats();
      const chats = response.data || [];

      const chatsMap: Record<string, UserChat> = {};
      const userIdToChatIdMap: Record<string, string> = {};
      const currentUserId = useAuthStore.getState().user?.id;
      const newUsers: Record<string, BasicUser> = {};

      chats.forEach((chat: UserChat) => {
        chatsMap[chat.id] = chat;

        const otherUserId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
        const otherUser = chat.user1Id === currentUserId ? chat.user2 : chat.user1;

        if (otherUser && otherUserId) {
          newUsers[otherUserId] = otherUser;
          userIdToChatIdMap[otherUserId] = chat.id;
        }
      });

      set((currentState) => {
        const newMetadata: Record<string, UserMetadata> = { ...currentState.metadata };
        
        Object.keys(userIdToChatIdMap).forEach((userId) => {
          newMetadata[userId] = createDefaultMetadata({
            ...currentState.metadata[userId],
            chatId: userIdToChatIdMap[userId],
          });
        });

        return {
          users: { ...currentState.users, ...newUsers },
          metadata: newMetadata,
          chats: chatsMap,
          userIdToChatId: userIdToChatIdMap,
          lastChatsFetchTime: now,
          chatsLoading: false,
          isFetchingChats: false,
        };
      });

      void pruneThreadIndexUserChatsNotIn(new Set(Object.keys(chatsMap))).then(() => {
        bridgeBumpChatListDexie();
      });

      if (chats.length > 0) {
        const chatIds = Object.keys(chatsMap);
        void warmChatSyncHeads(chatIds.map((id) => ({ contextType: 'USER' as const, contextId: id })));
      }
    } catch (error) {
      console.error('Failed to fetch user chats:', error);
      set({ chatsLoading: false, isFetchingChats: false });
    }
  },

  invalidateUserChatsCache: () => {
    set({ lastChatsFetchTime: 0 });
  },

  invalidatePlayersCache: () => {
    set({ lastPlayersFetchTime: 0 });
  },

  refresh: async () => {
    const state = get();
    state.invalidatePlayersCache();
    await Promise.all([state.fetchUserChats(), state.fetchPlayers()]);
  },

  clear: () => {
    set({
      users: {},
      metadata: {},
      chats: {},
      userIdToChatId: {},
      lastPlayersFetchTime: 0,
      lastChatsFetchTime: 0,
      invitableMaxSocialLevel: null,
      isFetching: false,
      isFetchingChats: false,
    });
  },
}));

const originalFetchUserChats = usePlayersStore.getState().fetchUserChats;
usePlayersStore.setState({
  fetchUserChats: async () => {
    initializeStore();
    return originalFetchUserChats();
  },
});

initializeStore();
