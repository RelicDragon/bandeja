import type { GroupChannel } from '@/api/chat';
import { getChatKey } from '@/utils/chatListHelpers';
import { getMarketChatDisplayTitle } from '@/utils/marketChatUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
import { chatListUnreadFilterCount } from '@/components/chat/chatListUnreadFilter';
import type { ChatItem } from '@/components/chat/chatListTypes';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import { type ContextKey } from '@/services/chat/unreadSnapshot';
import { selectContextUnreadForListItem, type UnreadStoreState } from '@/store/unreadStore';
import type { ChatInboxReadModel, ChatInboxSubtabBadges } from './types';

export type UnreadFilterCountOpts = {
  unreadStoreWarm: boolean;
  displayedByContext: Record<ContextKey, number>;
};

export function resolveThreadUnreadCountForFilter(
  item: ChatItem,
  opts: UnreadFilterCountOpts
): number {
  if (item.type === 'contact') return 0;
  const unreadState = {
    displayedByContext: opts.displayedByContext,
    byContext: opts.displayedByContext,
    fetchedAt: opts.unreadStoreWarm ? Date.now() : 0,
  } as UnreadStoreState;
  return selectContextUnreadForListItem(item, unreadState, { warm: opts.unreadStoreWarm });
}

function isUnreadFilterableThread(item: ChatItem): boolean {
  return (
    item.type === 'user' ||
    item.type === 'group' ||
    item.type === 'channel' ||
    item.type === 'game'
  );
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
  /** Clone only rows whose count actually moved — identity churn here repaints the whole market list. */
  return sorted.map((c) => {
    if (c.type !== 'channel') return c;
    const next = marketUnreadCounts?.[c.data.id] ?? c.unreadCount;
    return next === c.unreadCount ? c : { ...c, unreadCount: next };
  }) as ChatItem[];
}

function withResolvedUnreadCount(item: ChatItem, unreadOpts: UnreadFilterCountOpts): ChatItem {
  if (item.type === 'contact' || !('unreadCount' in item)) return item;
  const next = resolveThreadUnreadCountForFilter(item, unreadOpts);
  return next === item.unreadCount ? item : { ...item, unreadCount: next };
}

function deriveMarketUnreadChats(opts: DeriveDisplayedChatsOpts): ChatItem[] {
  const { threads, unreadStoreWarm, displayedByContext } = opts;
  const unreadOpts: UnreadFilterCountOpts = {
    unreadStoreWarm,
    displayedByContext,
  };
  const unreadRows = threads.filter(
    (c) => c.type === 'channel' && resolveThreadUnreadCountForFilter(c, unreadOpts) > 0
  );
  const sorted = [...unreadRows];
  sortChatItems(sorted, 'market');
  return sorted.map((c) => withResolvedUnreadCount(c, unreadOpts)) as ChatItem[];
}

export function deriveDisplayedChats(opts: DeriveDisplayedChatsOpts): ChatItem[] {
  const { chatsFilter, threads, unreadFilterActive, unreadStoreWarm, displayedByContext } = opts;
  if (chatsFilter === 'market') {
    if (unreadFilterActive) return deriveMarketUnreadChats(opts);
    return deriveMarketFilteredByRoleAndSearch(opts);
  }
  if (!unreadFilterActive) return threads;
  const unreadOpts: UnreadFilterCountOpts = {
    unreadStoreWarm,
    displayedByContext,
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

  const marketBuyerSellerUnread = unreadStoreWarm
    ? marketBuyerSellerUnreadFromStore
    : deriveMarketBuyerSellerUnreadLegacy(threads, marketUnreadCounts, userId);

  return {
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
