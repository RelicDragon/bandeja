import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { ChatDraft, GroupChannel, getLastMessageTime } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { sortChatItems } from '@/utils/chatListSort';
import type { ChatItem } from '@/utils/chatListSort';
import type { ChatMessage } from '@/api/chat';
import type { BasicUser } from '@/types';

export const getChatKey = (c: ChatItem) => `${c.type}-${c.type === 'contact' ? c.userId : c.data.id}`;

export const deduplicateChats = (chats: ChatItem[]) => {
  const seen = new Set<string>();
  return chats.filter((c) => {
    const key = getChatKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const calculateLastMessageDate = (
  lastMessage: ChatMessage | { preview: string; updatedAt: string } | null | undefined,
  draft: ChatDraft | null | undefined,
  updatedAt: string
): Date => {
  const lastMessageTime = getLastMessageTime(lastMessage);
  const draftTime = draft ? new Date(draft.updatedAt).getTime() : 0;
  const updatedTime = new Date(updatedAt).getTime();
  return new Date(Math.max(lastMessageTime, draftTime, updatedTime));
};

export const groupsToChatItems = (
  groups: GroupChannel[],
  groupUnreads: Record<string, number>,
  allDrafts: ChatDraft[],
  sortFilter: 'users' | 'bugs' | 'channels',
  userId?: string
): ChatItem[] => {
  const items: ChatItem[] = [];
  groups.forEach((group) => {
    if (!group.isChannel && (group.isParticipant || group.isOwner)) {
      const draft = matchDraftToChat(allDrafts, 'GROUP', group.id);
      const lastMessageDate =
        group.lastMessage || draft ? calculateLastMessageDate(group.lastMessage, draft, group.updatedAt) : null;
      items.push({
        type: 'group',
        data: group,
        lastMessageDate,
        unreadCount: groupUnreads[group.id] || 0,
        draft: draft || null
      });
    }
  });
  sortChatItems(items, sortFilter, userId);
  return items;
};

export interface ChannelsToChatItemsOptions {
  filterByIsChannel?: boolean;
  filterByIsGroup?: boolean;
  useUpdatedAtFallback?: boolean;
}

export const channelsToChatItems = (
  channels: GroupChannel[],
  channelUnreads: Record<string, number>,
  sortFilter: 'bugs' | 'channels' | 'market',
  options: ChannelsToChatItemsOptions = {}
): ChatItem[] => {
  const { filterByIsChannel = false, filterByIsGroup = false, useUpdatedAtFallback = false } = options;
  const items: ChatItem[] = [];
  channels.forEach((channel) => {
    if (filterByIsChannel && !channel.isChannel) return;
    if (filterByIsGroup && channel.isChannel) return;
    const lastMessageDate = channel.lastMessage
      ? new Date(getLastMessageTime(channel.lastMessage))
      : useUpdatedAtFallback
        ? new Date(channel.updatedAt)
        : null;
    items.push({
      type: 'channel',
      data: channel,
      lastMessageDate,
      unreadCount: channelUnreads[channel.id] || 0
    });
  });
  sortChatItems(items, sortFilter);
  return items;
};

export type FilterCache = {
  chats: ChatItem[];
  cityUsers?: BasicUser[];
  bugsHasMore?: boolean;
  usersHasMore?: boolean;
  channelsHasMore?: boolean;
  marketHasMore?: boolean;
};

export type PaginationSetters = {
  setBugsHasMore: (v: boolean) => void;
  setUsersHasMore: (v: boolean) => void;
  setChannelsHasMore: (v: boolean) => void;
  setMarketHasMore?: (v: boolean) => void;
  bugsPageRef: MutableRefObject<number>;
  usersPageRef: MutableRefObject<number>;
  channelsPageRef: MutableRefObject<number>;
  marketPageRef?: MutableRefObject<number>;
};

export const applyPaginationState = (
  filter: 'users' | 'bugs' | 'channels' | 'market',
  cached: FilterCache,
  setters: PaginationSetters
) => {
  if (filter === 'bugs') {
    setters.setBugsHasMore(cached.bugsHasMore ?? false);
    setters.bugsPageRef.current = 1;
  } else if (filter === 'users') {
    setters.setUsersHasMore(cached.usersHasMore ?? false);
    setters.usersPageRef.current = 1;
  } else if (filter === 'channels') {
    setters.setChannelsHasMore(cached.channelsHasMore ?? false);
    setters.channelsPageRef.current = 1;
  } else if (filter === 'market' && setters.setMarketHasMore && setters.marketPageRef) {
    setters.setMarketHasMore(cached.marketHasMore ?? false);
    setters.marketPageRef.current = 1;
  }
};

export type LoadMoreConfig = {
  isActive: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  pageRef: MutableRefObject<number>;
  fetcher: (page: number) => Promise<{ chats: ChatItem[]; hasMore: boolean }>;
  setChats: Dispatch<SetStateAction<ChatItem[]>>;
  setLoadingMore: (v: boolean) => void;
  setHasMore: (v: boolean) => void;
  cacheKey: 'users' | 'bugs' | 'channels' | 'market';
  cacheRef: MutableRefObject<Partial<Record<'users' | 'bugs' | 'channels' | 'market', FilterCache>>>;
  deduplicate: (chats: ChatItem[]) => ChatItem[];
};

export const createLoadMore = (config: LoadMoreConfig) => async () => {
  const {
    isActive,
    loadingMore,
    hasMore,
    pageRef,
    fetcher,
    setChats,
    setLoadingMore,
    setHasMore,
    cacheKey,
    cacheRef,
    deduplicate
  } = config;
  if (!isActive || loadingMore || !hasMore) return;
  setLoadingMore(true);
  try {
    const nextPage = pageRef.current + 1;
    const { chats: moreChats, hasMore: nextHasMore } = await fetcher(nextPage);
    pageRef.current = nextPage;
    setChats((prev) => deduplicate([...prev, ...moreChats]));
    setHasMore(nextHasMore);
    const cached = cacheRef.current[cacheKey];
    if (cached) {
      cached.chats = deduplicate([...cached.chats, ...moreChats]);
      if (cacheKey === 'bugs') cached.bugsHasMore = nextHasMore;
      else if (cacheKey === 'users') cached.usersHasMore = nextHasMore;
      else if (cacheKey === 'channels') cached.channelsHasMore = nextHasMore;
      else if (cacheKey === 'market') cached.marketHasMore = nextHasMore;
    }
  } finally {
    setLoadingMore(false);
  }
};
