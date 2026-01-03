import { create } from 'zustand';
import { chatApi, UserChat } from '@/api/chat';
import { usersApi, InvitablePlayer } from '@/api/users';
import { useAuthStore } from './authStore';
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
  updateUnreadCount: (chatId: string, count: number | ((current: number) => number)) => void;
  markChatAsRead: (chatId: string) => void;
  
  fetchPlayers: () => Promise<void>;
  fetchUserChats: () => Promise<void>;
  fetchUnreadCounts: () => Promise<void>;
  refresh: () => Promise<void>;
  clear: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000;
let initSubscribed = false;
let socketSubscriptionsSetup = false;
let newMessageHandler: ((message: NewUserChatMessage) => void) | null = null;
let readReceiptHandler: ((readReceipt: UserChatReadReceipt) => void) | null = null;
let cleanupPromise: Promise<void> | null = null;

const createDefaultMetadata = (existing?: UserMetadata): UserMetadata => ({
  interactionCount: existing?.interactionCount || 0,
  lastFetchedAt: existing?.lastFetchedAt || Date.now(),
  ...existing,
});

const setupSocketSubscriptions = () => {
  if (socketSubscriptionsSetup) return;
  socketSubscriptionsSetup = true;

  import('@/services/socketService').then(({ socketService }) => {
    newMessageHandler = (message: NewUserChatMessage) => {
      const store = usePlayersStore.getState();
      const chat = store.getChatById(message.contextId);
      if (chat) {
        store.updateUnreadCount(chat.id, (current) => (current || 0) + 1);
      } else {
        store.fetchUserChats();
      }
    };

    readReceiptHandler = (readReceipt: UserChatReadReceipt) => {
      const { user } = useAuthStore.getState();
      if (readReceipt.userId === user?.id) {
        usePlayersStore.getState().fetchUnreadCounts();
      }
    };

    socketService.on('new-user-chat-message', newMessageHandler);
    socketService.on('user-chat-read-receipt', readReceiptHandler);
  });
};

const cleanupSocketSubscriptions = () => {
  if (!socketSubscriptionsSetup) return;
  if (cleanupPromise) return cleanupPromise;

  cleanupPromise = import('@/services/socketService').then(({ socketService }) => {
    if (newMessageHandler) {
      socketService.off('new-user-chat-message', newMessageHandler);
      newMessageHandler = null;
    }
    if (readReceiptHandler) {
      socketService.off('user-chat-read-receipt', readReceiptHandler);
      readReceiptHandler = null;
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
      const currentMetadata = state.metadata[userId] || {
        interactionCount: 0,
        lastFetchedAt: Date.now(),
      };
      
      return {
        metadata: {
          ...state.metadata,
          [userId]: {
            ...currentMetadata,
            interactionCount: currentMetadata.interactionCount + 1,
            lastInteractionAt: Date.now(),
          },
        },
      };
    });
  },

  getChatByUserId: (userId: string) => {
    const state = get();
    const currentUserId = useAuthStore.getState().user?.id;
    if (!currentUserId) return undefined;

    return Object.values(state.chats).find(
      (chat) =>
        (chat.user1Id === currentUserId && chat.user2Id === userId) ||
        (chat.user1Id === userId && chat.user2Id === currentUserId)
    );
  },

  getChatById: (chatId: string) => {
    return get().chats[chatId];
  },

  getUnreadCount: (chatId: string) => {
    return get().unreadCounts[chatId] || 0;
  },

  getUnreadCountByUserId: (userId: string) => {
    const chat = get().getChatByUserId(userId);
    if (!chat) return 0;
    return get().unreadCounts[chat.id] || 0;
  },

  updateUnreadCount: (chatId: string, count: number | ((current: number) => number)) => {
    set((state) => {
      const currentCount = state.unreadCounts[chatId] || 0;
      const newCount = typeof count === 'function' ? count(currentCount) : count;
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [chatId]: newCount,
        },
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

  fetchPlayers: async () => {
    const state = get();
    const now = Date.now();

    if (state.isFetching) {
      return;
    }

    const cacheValid = state.lastPlayersFetchTime > 0 && now - state.lastPlayersFetchTime < CACHE_DURATION;
    if (cacheValid) {
      return;
    }

    set({ loading: true, isFetching: true });
    try {
      const response = await usersApi.getInvitablePlayers();
      const players = response.data || [];

      const basicUsers: BasicUser[] = players.map((p: InvitablePlayer) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        avatar: p.avatar,
        level: p.level,
        socialLevel: p.socialLevel,
        gender: p.gender,
      }));

      const interactionMetadata: Record<string, Partial<UserMetadata>> = {};
      players.forEach((p: InvitablePlayer) => {
        if (p.interactionCount > 0) {
          interactionMetadata[p.id] = { interactionCount: p.interactionCount };
        }
      });

      set((currentState) => {
        const newUsers: Record<string, BasicUser> = {};
        const newMetadata: Record<string, UserMetadata> = {};
        const updateTime = Date.now();

        basicUsers.forEach((user) => {
          newUsers[user.id] = user;
          newMetadata[user.id] = createDefaultMetadata({
            ...currentState.metadata[user.id],
            ...interactionMetadata[user.id],
            lastFetchedAt: updateTime,
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
    } catch (error) {
      console.error('Failed to fetch players:', error);
      set({ loading: false, isFetching: false });
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
      const currentUserId = useAuthStore.getState().user?.id;
      const newUsers: Record<string, BasicUser> = {};
      const updatedMetadata: Record<string, Partial<UserMetadata>> = {};

      chats.forEach((chat: UserChat) => {
        chatsMap[chat.id] = chat;

        const otherUserId = chat.user1Id === currentUserId ? chat.user2Id : chat.user1Id;
        const otherUser = chat.user1Id === currentUserId ? chat.user2 : chat.user1;

        if (otherUser && otherUserId) {
          newUsers[otherUserId] = otherUser;

          updatedMetadata[otherUserId] = {
            ...updatedMetadata[otherUserId],
            chatId: chat.id,
          };
        }
      });

      set((currentState) => {
        const finalMetadata: Record<string, UserMetadata> = { ...currentState.metadata };
        Object.keys(updatedMetadata).forEach((userId) => {
          finalMetadata[userId] = createDefaultMetadata({
            ...currentState.metadata[userId],
            ...updatedMetadata[userId],
          });
        });

        return {
          users: { ...currentState.users, ...newUsers },
          metadata: finalMetadata,
          chats: chatsMap,
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
