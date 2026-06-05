import { create } from 'zustand';
import type { ChatDraft } from '@/api/chat';
import {
  applyDraftsToChatItems,
  deduplicateChats,
  type FilterCache,
} from '@/utils/chatListHelpers';
import type { ChatItem } from './chatListTypes';

export type ChatsFilterType = 'users' | 'bugs' | 'channels' | 'market';

export type FilterPagination = {
  hasMore: boolean;
  page: number;
  loadingMore: boolean;
};

const emptyPagination = (): Record<ChatsFilterType, FilterPagination> => ({
  users: { hasMore: false, page: 1, loadingMore: false },
  bugs: { hasMore: false, page: 1, loadingMore: false },
  channels: { hasMore: false, page: 1, loadingMore: false },
  market: { hasMore: false, page: 1, loadingMore: false },
});

const INITIAL = {
  userId: null as string | null,
  activeFilter: 'users' as ChatsFilterType,
  rows: [] as ChatItem[],
  filterCache: {} as Partial<Record<ChatsFilterType, FilterCache>>,
  pagination: emptyPagination(),
  loading: true,
  lastFetchTime: 0,
  inFlightByFilter: {} as Partial<Record<ChatsFilterType, Promise<void>>>,
  drafts: null as ChatDraft[] | null,
};

export type ChatListFeedState = typeof INITIAL & {
  clearWhenUserMismatch: (userId: string | undefined) => void;
  setUserId: (userId: string | null) => void;
  setActiveFilter: (filter: ChatsFilterType) => void;
  setLoading: (loading: boolean) => void;
  setLastFetchTime: (t: number) => void;
  getFilterCache: (filter: ChatsFilterType) => FilterCache | undefined;
  setFilterCache: (filter: ChatsFilterType, entry: FilterCache) => void;
  invalidateFilterCache: (filter: ChatsFilterType) => void;
  commitFilterCache: (
    filter: ChatsFilterType,
    entry: FilterCache,
    opts?: { applyToVisible?: boolean; userId?: string }
  ) => void;
  patchRows: (updater: (prev: ChatItem[]) => ChatItem[]) => void;
  patchRowsForFilter: (filter: ChatsFilterType, updater: (prev: ChatItem[]) => ChatItem[]) => void;
  setRows: (rows: ChatItem[]) => void;
  mergeLoadMoreRows: (filter: ChatsFilterType, moreChats: ChatItem[], hasMore: boolean) => void;
  setPagination: (filter: ChatsFilterType, patch: Partial<FilterPagination>) => void;
  applyPaginationFromCache: (filter: ChatsFilterType, cached: FilterCache) => void;
  registerInFlight: (filter: ChatsFilterType, promise: Promise<void>) => void;
  clearInFlight: (filter: ChatsFilterType) => void;
  getInFlight: (filter: ChatsFilterType) => Promise<void> | undefined;
  setDrafts: (drafts: ChatDraft[] | null) => void;
  getDrafts: () => ChatDraft[] | null;
  invalidateDrafts: () => void;
  reapplyDrafts: (
    allDrafts: ChatDraft[],
    filter: ChatsFilterType,
    userId: string
  ) => void;
  resetForTests: () => void;
};

function rowsForFilter(
  s: Pick<ChatListFeedState, 'activeFilter' | 'rows' | 'filterCache'>,
  filter: ChatsFilterType
): ChatItem[] {
  return s.filterCache[filter]?.chats ?? (s.activeFilter === filter ? s.rows : []);
}

function paginationFromCache(filter: ChatsFilterType, cached: FilterCache): Partial<FilterPagination> {
  if (filter === 'bugs') return { hasMore: cached.bugsHasMore ?? false, page: 1 };
  if (filter === 'users') return { hasMore: cached.usersHasMore ?? false, page: 1 };
  if (filter === 'channels') return { hasMore: cached.channelsHasMore ?? false, page: 1 };
  return { hasMore: cached.marketHasMore ?? false, page: 1 };
}

export const useChatListFeedStore = create<ChatListFeedState>((set, get) => ({
  ...INITIAL,
  pagination: emptyPagination(),

  clearWhenUserMismatch: (userId) => {
    const { userId: cur } = get();
    if (userId && cur && cur !== userId) {
      set({
        ...INITIAL,
        pagination: emptyPagination(),
      });
    }
  },

  setUserId: (userId) => set({ userId }),

  setActiveFilter: (filter) => set({ activeFilter: filter }),

  setLoading: (loading) => set({ loading }),

  setLastFetchTime: (t) => set({ lastFetchTime: t }),

  getFilterCache: (filter) => get().filterCache[filter],

  setFilterCache: (filter, entry) => {
    set((s) => ({
      filterCache: { ...s.filterCache, [filter]: entry },
    }));
  },

  invalidateFilterCache: (filter) => {
    set((s) => {
      const next = { ...s.filterCache };
      delete next[filter];
      return { filterCache: next };
    });
  },

  commitFilterCache: (filter, entry, opts) => {
    const deduped = { ...entry, chats: deduplicateChats(entry.chats) };
    const userId = opts?.userId ?? get().userId;
    set((s) => {
      const pagination = { ...s.pagination, [filter]: { ...s.pagination[filter], ...paginationFromCache(filter, deduped) } };
      const applyVisible = opts?.applyToVisible !== false && s.activeFilter === filter;
      return {
        filterCache: { ...s.filterCache, [filter]: deduped },
        userId: userId ?? s.userId,
        pagination,
        ...(applyVisible ? { rows: deduped.chats } : {}),
      };
    });
  },

  patchRowsForFilter: (filter, updater) => {
    set((s) => {
      const prev = rowsForFilter(s, filter);
      const next = deduplicateChats(updater(prev));
      const cached = s.filterCache[filter];
      const entry: FilterCache = cached ? { ...cached, chats: next } : { chats: next };
      return {
        ...(s.activeFilter === filter ? { rows: next } : {}),
        filterCache: { ...s.filterCache, [filter]: entry },
      };
    });
  },

  patchRows: (updater) => {
    get().patchRowsForFilter(get().activeFilter, updater);
  },

  setRows: (rows) => {
    get().patchRowsForFilter(get().activeFilter, () => rows);
  },

  mergeLoadMoreRows: (filter, moreChats, hasMore) => {
    set((s) => {
      const cached = s.filterCache[filter];
      const base = cached?.chats ?? rowsForFilter(s, filter);
      const merged = deduplicateChats([...base, ...moreChats]);
      const entry: FilterCache = cached
        ? {
            ...cached,
            chats: merged,
            ...(filter === 'bugs' ? { bugsHasMore: hasMore } : {}),
            ...(filter === 'users' ? { usersHasMore: hasMore } : {}),
            ...(filter === 'channels' ? { channelsHasMore: hasMore } : {}),
            ...(filter === 'market' ? { marketHasMore: hasMore } : {}),
          }
        : {
            chats: merged,
            ...(filter === 'bugs' ? { bugsHasMore: hasMore } : {}),
            ...(filter === 'users' ? { usersHasMore: hasMore } : {}),
            ...(filter === 'channels' ? { channelsHasMore: hasMore } : {}),
            ...(filter === 'market' ? { marketHasMore: hasMore } : {}),
          };
      const page = (s.pagination[filter]?.page ?? 1) + 1;
      const pagination = {
        ...s.pagination,
        [filter]: { ...s.pagination[filter], hasMore, page, loadingMore: false },
      };
      return {
        filterCache: { ...s.filterCache, [filter]: entry },
        pagination,
        ...(s.activeFilter === filter ? { rows: merged } : {}),
      };
    });
  },

  setPagination: (filter, patch) => {
    set((s) => ({
      pagination: {
        ...s.pagination,
        [filter]: { ...s.pagination[filter], ...patch },
      },
    }));
  },

  applyPaginationFromCache: (filter, cached) => {
    get().setPagination(filter, paginationFromCache(filter, cached));
  },

  registerInFlight: (filter, promise) => {
    set((s) => ({
      inFlightByFilter: { ...s.inFlightByFilter, [filter]: promise },
    }));
  },

  clearInFlight: (filter) => {
    set((s) => {
      const next = { ...s.inFlightByFilter };
      delete next[filter];
      return { inFlightByFilter: next };
    });
  },

  getInFlight: (filter) => get().inFlightByFilter[filter],

  setDrafts: (drafts) => set({ drafts }),

  getDrafts: () => get().drafts,

  invalidateDrafts: () => set({ drafts: null }),

  reapplyDrafts: (allDrafts, filter, userId) => {
    set((s) => {
      const sourceRows = rowsForFilter(s, filter);
      if (sourceRows.length === 0 && allDrafts.length === 0) return s;
      const next = applyDraftsToChatItems(sourceRows, allDrafts, filter, userId);
      const cached = s.filterCache[filter];
      const entry: FilterCache = cached ? { ...cached, chats: next } : { chats: next };
      return {
        ...(s.activeFilter === filter ? { rows: next } : {}),
        filterCache: { ...s.filterCache, [filter]: entry },
        userId,
      };
    });
  },

  resetForTests: () =>
    set({
      ...INITIAL,
      pagination: emptyPagination(),
    }),
}));

export function clearChatListModuleCacheWhenUserMismatch(userId: string | undefined) {
  useChatListFeedStore.getState().clearWhenUserMismatch(userId);
}
