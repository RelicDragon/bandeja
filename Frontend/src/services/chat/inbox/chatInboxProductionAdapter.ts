import {
  loadThreadIndexForList,
  persistThreadIndexReplace,
  persistThreadIndexUpsert,
  patchThreadIndexClearUnread,
  patchThreadIndexFromMessage,
} from '@/services/chat/chatThreadIndex';
import { useChatListFeedStore } from '@/components/chat/chatListFeedStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { selectChatsSubtabBadge, isUnreadStoreWarm, useUnreadStore } from '@/store/unreadStore';
import { groupUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import { usePlayersStore } from '@/store/playersStore';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { ChatInboxAdapter, ChatInboxFeedSnapshot } from './types';

function paginationFromStore(): ChatInboxFeedSnapshot['pagination'] {
  const p = useChatListFeedStore.getState().pagination;
  return {
    bugsHasMore: p.bugs.hasMore,
    bugsLoadingMore: p.bugs.loadingMore,
    usersHasMore: p.users.hasMore,
    usersLoadingMore: p.users.loadingMore,
    channelsHasMore: p.channels.hasMore,
    channelsLoadingMore: p.channels.loadingMore,
    marketHasMore: p.market.hasMore,
    marketLoadingMore: p.market.loadingMore,
  };
}

export function createProductionChatInboxAdapter(
  overrides?: Partial<Pick<ChatInboxAdapter, 'fetchChatsForFilter' | 'loadMore' | 'refresh'>>
): ChatInboxAdapter {
  const adapter: ChatInboxAdapter = {
    subscribeFeed(listener) {
      return useChatListFeedStore.subscribe(listener);
    },

    getFeedSnapshot(): ChatInboxFeedSnapshot {
      const s = useChatListFeedStore.getState();
      return {
        threads: s.rows,
        loading: s.loading,
        pagination: paginationFromStore(),
        filterCache: s.filterCache,
      };
    },

    getSubtabBadge(filter) {
      return selectChatsSubtabBadge(filter, useUnreadStore.getState());
    },

    getUnreadStoreWarm() {
      return isUnreadStoreWarm(useUnreadStore.getState());
    },

    getMarketUnreadCounts(channelIds) {
      return groupUnreadCountsMap(channelIds, useUnreadStore.getState().displayedByContext);
    },

    getListChatMessageSeq() {
      return useSocketEventsStore.getState().listChatMessageSeq;
    },

    getListChatUnreadSeq() {
      return useSocketEventsStore.getState().listChatUnreadSeq;
    },

    getLastSyncCompletedAt() {
      return useChatSyncStore.getState().lastSyncCompletedAt;
    },

    getLastNewBug() {
      return useSocketEventsStore.getState().lastNewBug;
    },

    getLastChatUnreadCount() {
      return useSocketEventsStore.getState().lastChatUnreadCount;
    },

    getChatListDexieBump() {
      return useChatSyncStore.getState().chatListDexieBump;
    },

    getChatsFilter() {
      return useShellNavStore.getState().chatsFilter as ChatsFilterType;
    },

    refresh: overrides?.refresh ?? (async () => {}),
    fetchChatsForFilter: overrides?.fetchChatsForFilter ?? (async () => {}),
    loadMore: overrides?.loadMore ?? (async () => {}),

    upsertThreadIndex(filter, items) {
      void persistThreadIndexUpsert(filter, items);
    },

    replaceThreadIndex(filter, items) {
      void persistThreadIndexReplace(filter, items, { pruneRemoved: true });
    },

    invalidateUserChatsCache() {
      usePlayersStore.getState().invalidateUserChatsCache();
    },

    async getOrCreateUserChat(userId) {
      return usePlayersStore.getState().getOrCreateAndAddUserChat(userId);
    },

    patchRowsForFilter(filter, updater) {
      useChatListFeedStore.getState().patchRowsForFilter(filter, updater);
    },

    commitFilterCache(filter, entry, opts) {
      useChatListFeedStore.getState().commitFilterCache(filter, entry, opts);
    },

    invalidateFilterCache(filter) {
      useChatListFeedStore.getState().invalidateFilterCache(filter);
    },

    invalidateDrafts() {
      useChatListFeedStore.getState().invalidateDrafts();
    },

    setMutedChatsReset() {},
  };

  return adapter;
}

export const chatInboxThreadIndex = {
  upsert: persistThreadIndexUpsert,
  replace: persistThreadIndexReplace,
  load: loadThreadIndexForList,
  clearUnread: patchThreadIndexClearUnread,
  fromMessage: patchThreadIndexFromMessage,
};

let productionAdapter: ChatInboxAdapter | null = null;

export function getProductionChatInboxAdapter(): ChatInboxAdapter {
  if (!productionAdapter) {
    productionAdapter = createProductionChatInboxAdapter();
  }
  return productionAdapter;
}

export function setProductionChatInboxAdapter(adapter: ChatInboxAdapter) {
  productionAdapter = adapter;
}
