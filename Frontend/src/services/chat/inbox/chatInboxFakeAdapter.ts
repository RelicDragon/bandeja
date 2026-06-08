import type { ChatItem } from '@/components/chat/chatListTypes';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { FilterCache } from '@/utils/chatListHelpers';
import type { ChatInboxAdapter, ChatInboxFeedSnapshot } from './types';

export type FakeChatInboxState = {
  threads: ChatItem[];
  loading: boolean;
  pagination: ChatInboxFeedSnapshot['pagination'];
  filterCache: Partial<Record<ChatsFilterType, FilterCache>>;
  subtabs: { users: number; channels: number; market: number; bugs: number };
  unreadStoreWarm: boolean;
  marketUnreadByChannel: Record<string, number>;
};

export function createFakeChatInboxAdapter(initial?: Partial<FakeChatInboxState>): ChatInboxAdapter {
  const listeners = new Set<() => void>();
  const state: FakeChatInboxState = {
    threads: [],
    loading: false,
    pagination: {
      bugsHasMore: false,
      bugsLoadingMore: false,
      usersHasMore: false,
      usersLoadingMore: false,
      channelsHasMore: false,
      channelsLoadingMore: false,
      marketHasMore: false,
      marketLoadingMore: false,
    },
    filterCache: {},
    subtabs: { users: 0, channels: 0, market: 0, bugs: 0 },
    unreadStoreWarm: true,
    marketUnreadByChannel: {},
    ...initial,
  };

  const notify = () => listeners.forEach((l) => l());

  const threadIndex = new Map<ChatsFilterType, ChatItem[]>();

  return {
    subscribeFeed(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getFeedSnapshot(): ChatInboxFeedSnapshot {
      return {
        threads: state.threads,
        loading: state.loading,
        pagination: { ...state.pagination },
        filterCache: state.filterCache,
      };
    },

    getSubtabBadge(filter) {
      return state.subtabs[filter];
    },

    getUnreadStoreWarm() {
      return state.unreadStoreWarm;
    },

    getMarketUnreadCounts(channelIds) {
      const out: Record<string, number> = {};
      for (const id of channelIds) {
        out[id] = state.marketUnreadByChannel[id] ?? 0;
      }
      return out;
    },

    getListChatMessageSeq: () => 0,
    getListChatUnreadSeq: () => 0,
    getLastSyncCompletedAt: () => null,
    getLastNewBug: () => null,
    getLastChatUnreadCount: () => null,
    getChatListDexieBump: () => 0,
    getChatsFilter: () => 'users',

    async refresh() {
      notify();
    },

    async fetchChatsForFilter() {
      notify();
    },

    async loadMore() {},

    upsertThreadIndex(filter, items) {
      const prev = threadIndex.get(filter) ?? [];
      threadIndex.set(filter, [...prev, ...items]);
    },

    replaceThreadIndex(filter, items) {
      threadIndex.set(filter, [...items]);
    },

    invalidateUserChatsCache() {},
    async getOrCreateUserChat() {
      return null;
    },

    patchRowsForFilter(_filter, updater) {
      state.threads = updater(state.threads);
      notify();
    },

    commitFilterCache(filter, entry, opts) {
      state.filterCache[filter] = entry;
      if (opts?.applyToVisible !== false) {
        state.threads = entry.chats;
      }
      notify();
    },

    invalidateFilterCache(filter) {
      delete state.filterCache[filter];
      notify();
    },

    invalidateDrafts() {},
    setMutedChatsReset() {},
  };
}

export function setFakeThreads(adapter: ChatInboxAdapter, threads: ChatItem[]) {
  adapter.patchRowsForFilter('users', () => threads);
}

export function setFakeSubtabBadge(
  state: FakeChatInboxState,
  filter: keyof FakeChatInboxState['subtabs'],
  count: number
) {
  state.subtabs[filter] = count;
}
