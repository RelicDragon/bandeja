import { create } from 'zustand';
import { chatApi, UserChat } from '@/api/chat';
import { usersApi } from '@/api/users';
import { useAuthStore } from './authStore';
import { useSocketEventsStore } from './socketEventsStore';
import { BasicUser } from '@/types';
import type { NewUserChatMessage, UserChatReadReceipt } from '@/services/socketService';

export interface UserMetadata {
  chatId?: string;
  interactionCount: number;
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
  unreadCounts: Record<string, number>;
  loading: boolean;
  chatsLoading: boolean;
  isFetching: boolean;
  isFetchingChats: boolean;
  lastPlayersFetchTime: number;
  lastChatsFetchTime: number;
  
  getUser: (userId: string) => BasicUser | undefined;
  getUserMetadata: (userId: string) => UserMetadata | undefined;
  getUserWithMetadata: (userId: string) => (BasicUser & Partial<UserMetadata>) | undefined;
  setUser: (user: BasicUser) => void;
  setUsers: (users: BasicUser[]) => void;
  updateUserMetadata: (userId: string, metadata: Partial<UserMetadata>) => void;
  incrementInteractionCount: (userId: string) => void;
  
  getChatByUserId: (userId: string) => UserChat | undefined;
  getChatById: (chatId: string) => UserChat | undefined;
  getUnreadCount: (chatId: string) => number;
  getUnreadCountByUserId: (userId: string) => number;
  getUnreadUserChatsCount: () => number;
  updateUnreadCount: (chatId: string, count: number | ((current: number) => number)) => void;
  markChatAsRead: (chatId: string) => void;
  addChat: (chat: UserChat) => Promise<void>;
  getOrCreateAndAddUserChat: (userId: string) => Promise<UserChat | null>;

  fetchPlayers: () => Promise<BasicUser[]>;
  fetchUserChats: () => Promise<void>;
  invalidateUserChatsCache: () => void;
  fetchUnreadCounts: () => Promise<void>;
  refresh: () => Promise<void>;
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

const createDefaultMetadata = (existing?: UserMetadata): UserMetadata => ({
  interactionCount: existing?.interactionCount || 0,
  lastFetchedAt: existing?.lastFetchedAt || Date.now(),
  ...existing,
});

const setupSocketSubscriptions = () => {
  if (socketSubscriptionsSetup) return;
  socketSubscriptionsSetup = true;

  newMessageHandler = (message: NewUserChatMessage) => {
    console.log('[playersStore] New user chat message received:', message);
    const store = usePlayersStore.getState();
    const { user } = useAuthStore.getState();
    const chat = store.getChatById(message.contextId);
    console.log('[playersStore] Chat found in store:', chat ? `Yes (${chat.id})` : 'No');
    if (chat) {
      console.log('[playersStore] Current unread counts:', store.unreadCounts);

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

      if (message.senderId && message.senderId !== user?.id) {
        store.updateUnreadCount(chat.id, (current) => (current || 0) + 1);
      }
    } else {
      console.log('[playersStore] Chat not found, fetching user chats...');
      store.fetchUserChats();
    }
  };

  readReceiptHandler = (readReceipt: UserChatReadReceipt) => {
    const { user } = useAuthStore.getState();
    if (readReceipt.userId === user?.id) {
      usePlayersStore.getState().fetchUnreadCounts();
    }
  };

  let lastChatMessage: any = null;
  let lastChatReadReceipt: any = null;

  unifiedMessageHandler = useSocketEventsStore.subscribe((state) => {
    if (state.lastChatMessage !== lastChatMessage) {
      lastChatMessage = state.lastChatMessage;
      if (lastChatMessage && lastChatMessage.contextType === 'USER' && newMessageHandler) {
        newMessageHandler(lastChatMessage.message);
      }
    }
  });

  unifiedReadReceiptHandler = useSocketEventsStore.subscribe((state) => {
    if (state.lastChatReadReceipt !== lastChatReadReceipt) {
      lastChatReadReceipt = state.lastChatReadReceipt;
      if (lastChatReadReceipt && lastChatReadReceipt.contextType === 'USER' && readReceiptHandler) {
        readReceiptHandler(lastChatReadReceipt.readReceipt);
      }
    }
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
    if (state.isAuthenticated && state.user?.id) {
      usePlayersStore.getState().fetchUserChats();
      setupSocketSubscriptions();
    } else {
      usePlayersStore.getState().clear();
      cleanupSocketSubscriptions();
    }
  });

  if (useAuthStore.getState().isAuthenticated) {
    usePlayersStore.getState().fetchUserChats();
    setupSocketSubscriptions();
  }
};

export const usePlayersStore = create<UsersState>((set, get) => ({
  users: {},
  metadata: {},
  chats: {},
  userIdToChatId: {},
  unreadCounts: {},
  loading: false,
  chatsLoading: false,
  isFetching: false,
  isFetchingChats: false,
  lastPlayersFetchTime: 0,
  lastChatsFetchTime: 0,

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

  getUnreadCount: (chatId: string) => {
    const state = get();
    return state.unreadCounts[chatId] || 0;
  },

  getUnreadCountByUserId: (userId: string) => {
    const state = get();
    const chatId = state.userIdToChatId[userId];
    if (!chatId) return 0;
    return state.unreadCounts[chatId] || 0;
  },

  getUnreadUserChatsCount: () => {
    const state = get();
    return Object.values(state.unreadCounts).filter(count => count > 0).length;
  },

  updateUnreadCount: (chatId: string, count: number | ((current: number) => number)) => {
    set((state) => {
      const currentCount = state.unreadCounts[chatId] || 0;
      const newCount = typeof count === 'function' ? count(currentCount) : count;
      const newUnreadCounts = {
        ...state.unreadCounts,
        [chatId]: newCount,
      };
      console.log(`[playersStore] Updating unread count for chat ${chatId}: ${currentCount} -> ${newCount}`);
      console.log('[playersStore] Old unreadCounts object:', state.unreadCounts);
      console.log('[playersStore] New unreadCounts object:', newUnreadCounts);
      console.log('[playersStore] Objects are different?', state.unreadCounts !== newUnreadCounts);
      return {
        unreadCounts: newUnreadCounts,
      };
    });
  },

  markChatAsRead: (chatId: string) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [chatId]: 0,
      },
    }));
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
      if (unreadResponse.data && unreadResponse.data[chat.id] !== undefined) {
        set((state) => ({
          unreadCounts: {
            ...state.unreadCounts,
            [chat.id]: unreadResponse.data[chat.id],
          },
        }));
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

  fetchPlayers: async (): Promise<BasicUser[]> => {
    const state = get();
    const now = Date.now();

    if (state.isFetching) {
      return Object.values(state.users);
    }

    const cacheValid = state.lastPlayersFetchTime > 0 && now - state.lastPlayersFetchTime < CACHE_DURATION;
    if (cacheValid) {
      return Object.values(state.users);
    }

    set({ loading: true, isFetching: true });
    try {
      const response = await usersApi.getInvitablePlayers();
      const players = response.data || [];

      set((currentState) => {
        const newUsers: Record<string, BasicUser> = {};
        const newMetadata: Record<string, UserMetadata> = {};

        players.forEach((player) => {
          newUsers[player.id] = player;
          newMetadata[player.id] = createDefaultMetadata({
            ...currentState.metadata[player.id],
            ...(player.interactionCount > 0 && { interactionCount: player.interactionCount }),
            lastFetchedAt: now,
          });
        });

        return {
          users: { ...currentState.users, ...newUsers },
          metadata: { ...currentState.metadata, ...newMetadata },
          lastPlayersFetchTime: now,
          loading: false,
          isFetching: false,
        };
      });
      return players;
    } catch (error) {
      console.error('Failed to fetch players:', error);
      set({ loading: false, isFetching: false });
      return [];
    }
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

      if (chats.length > 0) {
        const chatIds = Object.keys(chatsMap);
        try {
          const unreadResponse = await chatApi.getUserChatsUnreadCounts(chatIds);
          set({ unreadCounts: unreadResponse.data || {} });
        } catch (error) {
          console.error('Failed to fetch unread counts:', error);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user chats:', error);
      set({ chatsLoading: false, isFetchingChats: false });
    }
  },

  invalidateUserChatsCache: () => {
    set({ lastChatsFetchTime: 0 });
  },

  fetchUnreadCounts: async () => {
    const state = get();
    const chatIds = Object.keys(state.chats);
    if (chatIds.length === 0) return;

    try {
      const response = await chatApi.getUserChatsUnreadCounts(chatIds);
      set({ unreadCounts: response.data || {} });
    } catch (error) {
      console.error('Failed to fetch unread counts:', error);
    }
  },

  refresh: async () => {
    const state = get();
    await Promise.all([state.fetchUserChats(), state.fetchPlayers()]);
  },

  clear: () => {
    set({
      users: {},
      metadata: {},
      chats: {},
      userIdToChatId: {},
      unreadCounts: {},
      lastPlayersFetchTime: 0,
      lastChatsFetchTime: 0,
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
