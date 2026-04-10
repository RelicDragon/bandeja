import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  ChatDraft,
  GroupChannel,
  getLastMessageTime,
  isLastMessagePreview,
  type ChatMessage,
  type LastMessagePreview,
} from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { sortChatItems, type ChatItem, type ChatListOutbox } from '@/utils/chatListSort';
import type { BasicUser } from '@/types';

export const getChatKey = (c: ChatItem) => `${c.type}-${c.type === 'contact' ? c.userId : c.data.id}`;

type ThreadIndexData = { lastMessage?: ChatMessage | LastMessagePreview | null; updatedAt?: string };

function threadLastMessageSortTime(m: ChatMessage | LastMessagePreview | null | undefined): number {
  if (!m) return 0;
  if (isLastMessagePreview(m)) return new Date(m.updatedAt).getTime();
  const cm = m as ChatMessage;
  const c = new Date(cm.createdAt).getTime();
  const u = cm.updatedAt ? new Date(cm.updatedAt).getTime() : 0;
  return Math.max(c, u || c);
}

function mergeDexieThreadData<T extends ThreadIndexData>(pnData: T, dnData: T): T {
  const tP = threadLastMessageSortTime(pnData.lastMessage);
  const tD = threadLastMessageSortTime(dnData.lastMessage);
  const base = { ...pnData, ...dnData } as T;
  if (!pnData.lastMessage && !dnData.lastMessage) return base;
  if (dnData.lastMessage && !pnData.lastMessage) {
    return {
      ...base,
      lastMessage: dnData.lastMessage,
      updatedAt: dnData.updatedAt ?? base.updatedAt,
    };
  }
  if (pnData.lastMessage && !dnData.lastMessage) {
    return {
      ...base,
      lastMessage: pnData.lastMessage,
      updatedAt: pnData.updatedAt ?? base.updatedAt,
    };
  }
  if (tD > tP) {
    return {
      ...base,
      lastMessage: dnData.lastMessage,
      updatedAt: dnData.updatedAt ?? base.updatedAt,
    };
  }
  return {
    ...base,
    lastMessage: pnData.lastMessage,
    updatedAt: pnData.updatedAt ?? base.updatedAt,
  };
}

export function mergeChatListOutboxFromDexieSlice(prev: ChatItem[], dexSlice: ChatItem[]): ChatItem[] {
  if (dexSlice.length === 0) return prev;
  const dexByKey = new Map<string, ChatItem>();
  for (const d of dexSlice) {
    dexByKey.set(getChatKey(d), d);
  }
  return prev.map((p) => {
    if (p.type === 'contact') return p;
    const d = dexByKey.get(getChatKey(p));
    if (!d || d.type === 'contact') return p;
    const next = { ...p } as ChatItem & { listOutbox?: ChatListOutbox | null };
    if ('listOutbox' in d && d.listOutbox != null) {
      next.listOutbox = d.listOutbox;
    } else {
      delete next.listOutbox;
    }
    return next as ChatItem;
  });
}

export function mergeChatListFromThreadIndexDexie(
  prev: ChatItem[],
  dexSlice: ChatItem[],
  listFilter: 'users' | 'bugs' | 'channels' | 'market',
  userId?: string
): ChatItem[] {
  if (dexSlice.length === 0) return prev;
  const dexByKey = new Map<string, ChatItem>();
  for (const d of dexSlice) {
    if (d.type !== 'contact') dexByKey.set(getChatKey(d), d);
  }
  const next = prev.map((p) => {
    if (p.type === 'contact') return p;
    const d = dexByKey.get(getChatKey(p));
    if (!d || d.type === 'contact') return p;
    type NonContact = Exclude<ChatItem, { type: 'contact' }>;
    const pn = p as NonContact;
    const dn = d as NonContact;
    const mergedData = mergeDexieThreadData(
      pn.data as ThreadIndexData,
      dn.data as ThreadIndexData
    ) as NonContact['data'];
    const merged = { ...pn, ...dn, data: mergedData } as NonContact;
    const draft = 'draft' in merged ? merged.draft ?? null : null;
    const updatedAtForSort =
      (mergedData as { updatedAt?: string }).updatedAt ??
      (pn.data as { updatedAt?: string }).updatedAt ??
      (dn.data as { updatedAt?: string }).updatedAt ??
      '';
    const lastMessageDate =
      mergedData.lastMessage || draft
        ? calculateLastMessageDate(mergedData.lastMessage, draft, updatedAtForSort)
        : null;
    return { ...merged, lastMessageDate } as ChatItem;
  });
  return deduplicateChats(sortChatItems(next, listFilter, userId));
}

export function threadIndexLiveMergeSig(chats: ChatItem[]): string {
  return chats
    .map((c) => {
      if (c.type === 'contact') return `c:${c.userId}`;
      const lm =
        c.type === 'user' || c.type === 'group' || c.type === 'channel'
          ? (c.data as { lastMessage?: { id?: string; updatedAt?: string } }).lastMessage
          : c.type === 'game'
            ? (c.data as { lastMessage?: { id?: string; updatedAt?: string } }).lastMessage
            : undefined;
      const ob = 'listOutbox' in c ? c.listOutbox : undefined;
      const obState =
        ob && typeof ob === 'object' && ob !== null && 'state' in ob
          ? String((ob as { state?: string }).state ?? '')
          : '';
      return `${getChatKey(c)}:${c.lastMessageDate?.getTime() ?? 0}:${lm?.id ?? ''}:${lm?.updatedAt ?? ''}:${obState}`;
    })
    .join('\0');
}

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
  options: ChannelsToChatItemsOptions & { allDrafts?: ChatDraft[] } = {}
): ChatItem[] => {
  const { filterByIsChannel = false, filterByIsGroup = false, useUpdatedAtFallback = false, allDrafts = [] } = options;
  const items: ChatItem[] = [];
  channels.forEach((channel) => {
    if (filterByIsChannel && !channel.isChannel) return;
    if (filterByIsGroup && channel.isChannel) return;
    const draft = matchDraftToChat(allDrafts, 'GROUP', channel.id);
    const lastMessageDate =
      channel.lastMessage || draft
        ? calculateLastMessageDate(channel.lastMessage, draft, channel.updatedAt)
        : useUpdatedAtFallback
          ? new Date(channel.updatedAt)
          : null;
    items.push({
      type: 'channel',
      data: channel,
      lastMessageDate,
      unreadCount: channelUnreads[channel.id] || 0,
      draft: draft || null
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
  afterMore?: (moreChats: ChatItem[]) => void;
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
    deduplicate,
    afterMore,
  } = config;
  if (!isActive || loadingMore || !hasMore) return;
  setLoadingMore(true);
  try {
    const nextPage = pageRef.current + 1;
    const { chats: moreChats, hasMore: nextHasMore } = await fetcher(nextPage);
    pageRef.current = nextPage;
    setChats((prev) => deduplicate([...prev, ...moreChats]));
    afterMore?.(moreChats);
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
