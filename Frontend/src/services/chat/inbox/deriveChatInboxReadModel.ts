import type { GroupChannel } from '@/api/chat';
import { getChatKey } from '@/utils/chatListHelpers';
import { getMarketChatDisplayTitle } from '@/utils/marketChatUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
import { chatListUnreadFilterCount } from '@/components/chat/chatListUnreadFilter';
import type { ChatItem } from '@/components/chat/chatListTypes';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import { listItemToContextKey, type ContextKey } from '@/services/chat/unreadSnapshot';
import type { ChatInboxReadModel, ChatInboxSubtabBadges } from './types';

export type UnreadFilterCountOpts = {
  unreadStoreWarm: boolean;
  displayedByContext: Record<ContextKey, number>;
  marketUnreadCounts: Record<string, number>;
};

export function resolveThreadUnreadCountForFilter(
  item: ChatItem,
  opts: UnreadFilterCountOpts
): number {
  if (item.type === 'contact') return 0;
  if (opts.unreadStoreWarm) {
    if (item.type === 'channel' && item.data.marketItemId) {
      return opts.marketUnreadCounts[item.data.id] ?? 0;
    }
    const key = listItemToContextKey(item);
    if (!key) return 0;
    return opts.displayedByContext[key] ?? 0;
  }
  return item.unreadCount ?? 0;
}

function isUnreadFilterableThread(item: ChatItem): boolean {
  return (
    item.type === 'user' ||
    item.type === 'group' ||
    item.type === 'channel' ||
    item.type === 'game'
  );
}

export function buildUnreadByThread(threads: ChatItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const thread of threads) {
    if (thread.type === 'contact') continue;
    map.set(getChatKey(thread), thread.unreadCount ?? 0);
  }
  return map;
}

export function deriveMarketBuyerSellerUnreadLegacy(
  threads: ChatItem[],
  marketUnreadCounts: Record<string, number>,
  userId: string | undefined
): { buyer: number; seller: number } {
  let buyer = 0;
  let seller = 0;
  threads
    .filter(
      (c): c is ChatItem & { type: 'channel'; data: GroupChannel } =>
        c.type === 'channel' && !!(c.data as GroupChannel).marketItemId
    )
    .forEach((c) => {
      const count = marketUnreadCounts[(c.data as GroupChannel).id] ?? c.unreadCount ?? 0;
      if ((c.data as GroupChannel).buyerId === userId) buyer += count;
      if ((c.data as GroupChannel).marketItem?.sellerId === userId) seller += count;
    });
  return { buyer, seller };
}

export type DeriveDisplayedChatsOpts = {
  chatsFilter: ChatsFilterType;
  threads: ChatItem[];
  unreadFilterActive: boolean;
  marketChatRole: 'buyer' | 'seller';
  debouncedSearchQuery: string;
  userId: string | undefined;
  marketUnreadCounts: Record<string, number>;
  unreadStoreWarm: boolean;
  displayedByContext: Record<ContextKey, number>;
};

function matchesMarketSearch(
  chat: ChatItem,
  marketChatRole: 'buyer' | 'seller',
  query: string,
  normalize: (s: string) => string
): boolean {
  if (chat.type !== 'channel' || !chat.data.marketItemId) return false;
  const title = getMarketChatDisplayTitle(chat.data, marketChatRole);
  return normalize(title).includes(normalize(query));
}

export function deriveMarketFilteredByRoleAndSearch(opts: DeriveDisplayedChatsOpts): ChatItem[] {
  const { threads, marketChatRole, debouncedSearchQuery, userId, marketUnreadCounts } = opts;
  const roleFiltered = threads.filter(
    (c) =>
      c.type === 'channel' &&
      c.data.marketItemId &&
      (marketChatRole === 'buyer' ? c.data.buyerId === userId : c.data.marketItem?.sellerId === userId)
  );
  const normalize = (s: string) => s.toLowerCase();
  const searchFiltered = debouncedSearchQuery.trim()
    ? roleFiltered.filter((c) => matchesMarketSearch(c, marketChatRole, debouncedSearchQuery, normalize))
    : roleFiltered;
  const sorted = [...searchFiltered];
  sortChatItems(sorted, 'market');
  return sorted.map((c) =>
    c.type === 'channel' ? { ...c, unreadCount: marketUnreadCounts[c.data.id] ?? c.unreadCount } : c
  ) as ChatItem[];
}

function deriveMarketUnreadChats(opts: DeriveDisplayedChatsOpts): ChatItem[] {
  const { threads, marketUnreadCounts, unreadStoreWarm, displayedByContext } = opts;
  const unreadOpts: UnreadFilterCountOpts = {
    unreadStoreWarm,
    displayedByContext,
    marketUnreadCounts,
  };
  const unreadRows = threads.filter(
    (c) => c.type === 'channel' && resolveThreadUnreadCountForFilter(c, unreadOpts) > 0
  );
  const sorted = [...unreadRows];
  sortChatItems(sorted, 'market');
  return sorted.map((c) =>
    c.type === 'channel' ? { ...c, unreadCount: marketUnreadCounts[c.data.id] ?? c.unreadCount } : c
  ) as ChatItem[];
}

export function deriveDisplayedChats(opts: DeriveDisplayedChatsOpts): ChatItem[] {
  const { chatsFilter, threads, unreadFilterActive, unreadStoreWarm, displayedByContext, marketUnreadCounts } =
    opts;
  if (chatsFilter === 'market') {
    if (unreadFilterActive) return deriveMarketUnreadChats(opts);
    return deriveMarketFilteredByRoleAndSearch(opts);
  }
  if (!unreadFilterActive) return threads;
  const unreadOpts: UnreadFilterCountOpts = {
    unreadStoreWarm,
    displayedByContext,
    marketUnreadCounts,
  };
  return threads.filter(
    (c) => isUnreadFilterableThread(c) && resolveThreadUnreadCountForFilter(c, unreadOpts) > 0
  );
}

export function derivePinnedCountUsers(chatsFilter: ChatsFilterType, threads: ChatItem[]): number {
  if (chatsFilter !== 'users') return 0;
  return threads.filter((c) => (c.type === 'user' || c.type === 'group') && c.data.isPinned).length;
}

export type DeriveChatInboxReadModelInput = {
  threads: ChatItem[];
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  pagination: ChatInboxReadModel['pagination'];
  chatsFilter: ChatsFilterType;
  unreadFilterActive: boolean;
  marketChatRole: 'buyer' | 'seller';
  debouncedSearchQuery: string;
  userId: string | undefined;
  subtabs: ChatInboxSubtabBadges;
  unreadStoreWarm: boolean;
  displayedByContext: Record<ContextKey, number>;
  marketUnreadCounts: Record<string, number>;
  marketBuyerSellerUnreadFromStore: { buyer: number; seller: number };
};

export function deriveChatInboxReadModel(input: DeriveChatInboxReadModelInput): ChatInboxReadModel {
  const {
    threads,
    loading,
    refreshing,
    error,
    pagination,
    chatsFilter,
    unreadFilterActive,
    marketChatRole,
    debouncedSearchQuery,
    userId,
    subtabs,
    unreadStoreWarm,
    marketUnreadCounts,
    marketBuyerSellerUnreadFromStore,
    displayedByContext,
  } = input;

  const displayOpts: DeriveDisplayedChatsOpts = {
    chatsFilter,
    threads,
    unreadFilterActive,
    marketChatRole,
    debouncedSearchQuery,
    userId,
    marketUnreadCounts,
    unreadStoreWarm,
    displayedByContext,
  };

  const marketChannelIds =
    chatsFilter === 'market' ? threads.filter((c) => c.type === 'channel').map((c) => c.data.id) : [];
  const marketChannelIdsKey =
    chatsFilter !== 'market' || marketChannelIds.length === 0 ? '' : [...marketChannelIds].sort().join(',');

  const marketBuyerSellerUnread = unreadStoreWarm
    ? marketBuyerSellerUnreadFromStore
    : deriveMarketBuyerSellerUnreadLegacy(threads, marketUnreadCounts, userId);

  return {
    threads,
    unreadByThread: buildUnreadByThread(threads),
    subtabs,
    loading,
    refreshing,
    error,
    pagination,
    displayedChats: deriveDisplayedChats(displayOpts),
    unreadChatsCount: chatListUnreadFilterCount(unreadStoreWarm, chatsFilter, subtabs),
    unreadStoreWarm,
    marketBuyerSellerUnread,
    marketUnreadCounts,
    marketChannelIdsKey,
    pinnedCountUsers: derivePinnedCountUsers(chatsFilter, threads),
  };
}

export function sortThreadsForFilter(threads: ChatItem[], filter: ChatsFilterType, userId?: string): ChatItem[] {
  return sortChatItems([...threads], filter, userId);
}

export function mergeThreadUnreadCounts(
  threads: ChatItem[],
  unreadByKey: Map<string, number>
): ChatItem[] {
  return threads.map((thread) => {
    if (thread.type === 'contact') return thread;
    const key = getChatKey(thread);
    const count = unreadByKey.get(key);
    return count != null ? { ...thread, unreadCount: count } : thread;
  });
}

export function filterThreadsByTitleSearch(
  threads: ChatItem[],
  query: string,
  userId: string,
  normalize: (s: string) => string
): ChatItem[] {
  if (!query.trim()) return threads;
  const nq = normalize(query);
  return threads.filter((chat) => normalize(getChatTitle(chat, userId)).includes(nq));
}
