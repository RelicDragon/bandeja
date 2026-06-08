import type { ChatItem } from '@/components/chat/chatListTypes';
import type { ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { ChatType } from '@/components/chat/chatListTypes';
import type { BasicUser } from '@/types';
import type { FilterCache } from '@/utils/chatListHelpers';

export type ChatInboxSubtabBadges = {
  users: number;
  channels: number;
  market: number;
  bugs: number;
};

export type ChatInboxPagination = {
  bugsHasMore: boolean;
  bugsLoadingMore: boolean;
  usersHasMore: boolean;
  usersLoadingMore: boolean;
  channelsHasMore: boolean;
  channelsLoadingMore: boolean;
  marketHasMore: boolean;
  marketLoadingMore: boolean;
};

export type ChatInboxReadModel = {
  threads: ChatItem[];
  unreadByThread: Map<string, number>;
  subtabs: ChatInboxSubtabBadges;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  pagination: ChatInboxPagination;
  displayedChats: ChatItem[];
  unreadChatsCount: number;
  unreadStoreWarm: boolean;
  marketBuyerSellerUnread: { buyer: number; seller: number };
  marketUnreadCounts: Record<string, number>;
  marketChannelIdsKey: string;
  pinnedCountUsers: number;
};

export type ChatInboxSearchData = {
  cityUsers: BasicUser[];
  cityUsersLoading: boolean;
  searchableUsersData: { activeChats: ChatItem[]; cityUsers: BasicUser[] } | null;
  followingUsers: BasicUser[];
  followersUsers: BasicUser[];
};

export type ChatInboxFeedSnapshot = {
  threads: ChatItem[];
  loading: boolean;
  pagination: ChatInboxPagination;
  filterCache: Partial<Record<ChatsFilterType, FilterCache>>;
};

export type ChatInboxSocketContext = {
  chatsFilter: ChatsFilterType;
  isDesktop: boolean;
  selectedChatId: string | null | undefined;
  selectedChatType: ChatType | null | undefined;
  userId: string | undefined;
};

export type ChatInboxMutations = {
  refresh(): Promise<void>;
  fetchChatsForFilter(filter?: ChatsFilterType): Promise<void>;
  loadMore(): Promise<void>;
  upsertThreadIndex(filter: ChatsFilterType, items: ChatItem[]): void;
  replaceThreadIndex(filter: ChatsFilterType, items: ChatItem[]): void;
  invalidateUserChatsCache(): void;
  getOrCreateUserChat(userId: string): Promise<import('@/api/chat').UserChat | null>;
  patchRowsForFilter(filter: ChatsFilterType, updater: (prev: ChatItem[]) => ChatItem[]): void;
  commitFilterCache(
    filter: ChatsFilterType,
    entry: FilterCache,
    opts?: { applyToVisible?: boolean; userId?: string }
  ): void;
  invalidateFilterCache(filter: ChatsFilterType): void;
  invalidateDrafts(): void;
  setMutedChatsReset(): void;
};

export type ChatInboxAdapter = ChatInboxMutations & {
  subscribeFeed(listener: () => void): () => void;
  getFeedSnapshot(): ChatInboxFeedSnapshot;
  getSubtabBadge(filter: keyof ChatInboxSubtabBadges): number;
  getUnreadStoreWarm(): boolean;
  getMarketUnreadCounts(channelIds: string[]): Record<string, number>;
  getListChatMessageSeq(): number;
  getListChatUnreadSeq(): number;
  getLastSyncCompletedAt(): number | null;
  getLastNewBug(): unknown;
  getLastChatUnreadCount(): unknown;
  getChatListDexieBump(): number;
  getChatsFilter(): ChatsFilterType;
  setChatsFilter?(filter: ChatsFilterType): void;
};
