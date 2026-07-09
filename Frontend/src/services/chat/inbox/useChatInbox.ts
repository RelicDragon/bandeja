import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getLastMessageTime } from '@/api/chat';
import { deduplicateChats } from '@/utils/chatListHelpers';
import { sortChatItems } from '@/utils/chatListSort';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { loadGlobalInvitablePlayers } from '@/utils/loadGlobalInvitablePlayers';
import { favoritesApi } from '@/api/favorites';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { getDefaultBugsFilter, shouldApplyBugsFilterDefaultsForUser } from '@/components/bugs/bugsFilterParams';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import {
  useChatsSubtabUnreadBadge,
  useMarketBuyerSellerUnreadBadges,
  useUnreadStoreWarm,
} from '@/hooks/useUnreadBridge';
import { useUnreadStore } from '@/store/unreadStore';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';

import { useChatListMergedDrafts } from '@/components/chat/useChatListMergedDrafts';
import { useChatListPrefetch } from '@/components/chat/useChatListPrefetch';
import type { ChatItem, ChatSelectNavOptions, ChatType } from '@/components/chat/chatListTypes';
import type { BasicUser } from '@/types';
import type { FilterCache } from '@/utils/chatListHelpers';
import { deriveChatInboxReadModel } from './deriveChatInboxReadModel';
import { createChatInboxFetchOps } from './chatInboxFeedFetch';
import { getProductionChatInboxAdapter, setProductionChatInboxAdapter } from './chatInboxProductionAdapter';
import type { ChatInboxAdapter, ChatInboxFeedSnapshot } from './types';

function feedSnapshotsEqual(a: ChatInboxFeedSnapshot, b: ChatInboxFeedSnapshot): boolean {
  if (a.threads !== b.threads || a.loading !== b.loading || a.filterCache !== b.filterCache) {
    return false;
  }
  const ap = a.pagination;
  const bp = b.pagination;
  return (
    ap.bugsHasMore === bp.bugsHasMore &&
    ap.bugsLoadingMore === bp.bugsLoadingMore &&
    ap.usersHasMore === bp.usersHasMore &&
    ap.usersLoadingMore === bp.usersLoadingMore &&
    ap.channelsHasMore === bp.channelsHasMore &&
    ap.channelsLoadingMore === bp.channelsLoadingMore &&
    ap.marketHasMore === bp.marketHasMore &&
    ap.marketLoadingMore === bp.marketLoadingMore
  );
}
import {
  useChatInboxDraftReapplyEffect,
  useChatInboxFeedLifecycle,
  useChatInboxReapplyDraftsOnGameExit,
} from './useChatInboxFeedLifecycle';
import { useChatInboxDexieSyncEffects } from './useChatInboxDexieSyncEffects';
import { useChatInboxSocketEffects } from './useChatInboxSocketEffects';
import { chatInboxThreadIndex } from './chatInboxProductionAdapter';
import { shouldFetchMarketForUnknownGroupUnread } from './marketUnknownGroupUnread';

export type UseChatInboxOptions = {
  chatsFilter: ChatsFilterType;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
  debouncedSearchQuery?: string;
  contactsMode?: boolean;
  unreadFilterActive?: boolean;
  marketChatRole?: 'buyer' | 'seller';
  adapter?: ChatInboxAdapter;
};

export function useChatInbox(opts: UseChatInboxOptions) {
  const {
    chatsFilter,
    isDesktop = false,
    selectedChatId,
    selectedChatType,
    debouncedSearchQuery = '',
    contactsMode = false,
    unreadFilterActive = false,
    marketChatRole = 'buyer',
    adapter: adapterProp,
  } = opts;

  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const isOnline = useNetworkStore((s) => s.isOnline);
  const bugsFilter = useGameDetailsChromeStore((s) => s.bugsFilter);
  const setBugsFilter = useGameDetailsChromeStore((s) => s.setBugsFilter);

  useLayoutEffect(() => {
    if (!shouldApplyBugsFilterDefaultsForUser(userId)) return;
    setBugsFilter(getDefaultBugsFilter(Boolean(user?.isAdmin)));
  }, [userId, user?.isAdmin, setBugsFilter]);
  const viewingGameChatId = useGameDetailsChromeStore((s) => s.viewingGameChatId);
  const fetchFavorites = useFavoritesStore((s) => s.fetchFavorites);
  const chatListDexieBump = useChatSyncStore((s) => s.chatListDexieBump);
  const listChatMessageSeq = useSocketEventsStore((s) => s.listChatMessageSeq);
  const listChatUnreadSeq = useSocketEventsStore((s) => s.listChatUnreadSeq);
  const lastSyncCompletedAt = useChatSyncStore((s) => s.lastSyncCompletedAt);
  const lastNewBug = useSocketEventsStore((s) => s.lastNewBug);
  const lastChatUnreadCount = useSocketEventsStore((s) => s.lastChatUnreadCount);

  const { getMergedDrafts, applyDraftToCache } = useChatListMergedDrafts(userId);
  const adapterRef = useRef<ChatInboxAdapter>(adapterProp ?? getProductionChatInboxAdapter());
  if (adapterProp) adapterRef.current = adapterProp;

  const fetchOps = useMemo(
    () =>
      createChatInboxFetchOps({
        getMergedDrafts,
        adapter: adapterRef.current,
      }),
    [getMergedDrafts]
  );

  const fetchChatsForFilter = useCallback(
    async (filterArg?: ChatsFilterType) => {
      const filter = filterArg ?? chatsFilter;
      const fetchOptions =
        filter === 'bugs' && unreadFilterActive ? { ignoreBugsFilter: true as const } : undefined;
      await fetchOps.fetchChatsForFilter(filterArg, fetchOptions);
      if (filterArg === 'users' || (!filterArg && chatsFilter === 'users')) {
        setMutedChats({});
      }
      const cached = useChatListFeedStore.getState().getFilterCache(filter);
      if (cached?.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
      }
    },
    [fetchOps, chatsFilter, unreadFilterActive]
  );

  const loadMore = useCallback(async () => {
    const snap = adapterRef.current.getFeedSnapshot();
    const p = snap.pagination;
    if (chatsFilter === 'bugs') {
      const fetchBugs = (page: number) =>
        fetchOps.fetchBugs(page, unreadFilterActive ? { ignoreBugsFilter: true } : undefined);
      await fetchOps.runFeedLoadMore('bugs', true, p.bugsLoadingMore, p.bugsHasMore, fetchBugs);
    } else if (chatsFilter === 'users') {
      await fetchOps.runFeedLoadMore('users', true, p.usersLoadingMore, p.usersHasMore, fetchOps.fetchUsersGroups);
    } else if (chatsFilter === 'market') {
      await fetchOps.runFeedLoadMore('market', true, p.marketLoadingMore, p.marketHasMore, fetchOps.fetchMarket);
    } else {
      await fetchOps.runFeedLoadMore(
        'channels',
        true,
        p.channelsLoadingMore,
        p.channelsHasMore,
        fetchOps.fetchChannels
      );
    }
  }, [chatsFilter, fetchOps, unreadFilterActive]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await clearCachesExceptUnsyncedResults();
      if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
        useChatListFeedStore.getState().invalidateFilterCache(chatsFilter);
        await fetchChatsForFilter(chatsFilter);
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  useEffect(() => {
    const adapter = adapterRef.current;
    adapter.fetchChatsForFilter = fetchChatsForFilter;
    adapter.loadMore = loadMore;
    adapter.refresh = refresh;
    setProductionChatInboxAdapter(adapter);
  }, [fetchChatsForFilter, loadMore, refresh]);

  const feedSnapshotCacheRef = useRef<ChatInboxFeedSnapshot | null>(null);
  const getFeedSnapshot = useCallback(() => {
    const next = adapterRef.current.getFeedSnapshot();
    const prev = feedSnapshotCacheRef.current;
    if (prev && feedSnapshotsEqual(prev, next)) return prev;
    feedSnapshotCacheRef.current = next;
    return next;
  }, []);

  const feedSnapshot = useSyncExternalStore(
    (cb) => adapterRef.current.subscribeFeed(cb),
    getFeedSnapshot,
    getFeedSnapshot
  );

  const threads = feedSnapshot.threads;
  const loading = feedSnapshot.loading;
  const pagination = feedSnapshot.pagination;
  const chatsRef = useRef(threads);
  chatsRef.current = threads;

  const [refreshing, setRefreshing] = useState(false);
  const [cityUsers, setCityUsers] = useState<BasicUser[]>([]);
  const [cityUsersLoading, setCityUsersLoading] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<BasicUser[]>([]);
  const [followersUsers, setFollowersUsers] = useState<BasicUser[]>([]);
  const [searchableUsersData, setSearchableUsersData] = useState<{
    activeChats: ChatItem[];
    cityUsers: BasicUser[];
  } | null>(null);
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});

  const onUsersCacheApplied = useCallback((_cached: FilterCache, chats: ChatItem[]) => {
    const cached = useChatListFeedStore.getState().getFilterCache('users');
    if (cached?.cityUsers) {
      setCityUsers(cached.cityUsers);
      setSearchableUsersData({ activeChats: chats, cityUsers: cached.cityUsers });
    }
  }, []);

  const onMutedChatsReset = useCallback(() => setMutedChats({}), []);

  useChatListPrefetch(userId, isOnline, chatsRef);

  useChatInboxFeedLifecycle({
    userId,
    chatsFilter,
    getMergedDrafts,
    fetchOps,
    adapter: adapterRef.current,
    chatsRef,
    onUsersCacheApplied,
    onMutedChatsReset,
  });

  useChatInboxDexieSyncEffects({
    userId,
    chatsFilter,
    contactsMode,
    debouncedSearchQuery,
    chatListDexieBump,
  });

  const reapplyDraftsToList = useCallback(() => {
    if (!userId) return;
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') {
      return;
    }
    useChatListFeedStore.getState().invalidateDrafts();
    void (async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      const allDrafts = await getMergedDrafts(true);
      useChatListFeedStore.getState().reapplyDrafts(allDrafts, chatsFilter, userId);
    })();
  }, [userId, chatsFilter, getMergedDrafts]);

  useChatInboxReapplyDraftsOnGameExit(viewingGameChatId, reapplyDraftsToList);
  useChatInboxDraftReapplyEffect(loading, userId, chatsFilter, getMergedDrafts);

  useEffect(() => {
    if (userId) fetchFavorites();
  }, [userId, fetchFavorites]);

  useChatInboxSocketEffects({
    chatsFilter,
    isDesktop,
    selectedChatId,
    selectedChatType,
    userId,
    listChatMessageSeq,
    listChatUnreadSeq,
    lastSyncCompletedAt,
    lastNewBug,
    fetchChatsForFilter,
    fetchBugs: fetchOps.fetchBugs,
    applyDraftToCache,
    chatsRef,
  });

  const prevBugsFilterRef = useRef(bugsFilter);
  useEffect(() => {
    if (chatsFilter !== 'bugs') return;
    if (unreadFilterActive) return;
    if (prevBugsFilterRef.current === bugsFilter) return;
    prevBugsFilterRef.current = bugsFilter;
    adapterRef.current.invalidateFilterCache('bugs');
    let cancelled = false;
    fetchOps
      .fetchBugs(1)
      .then(({ chats, hasMore }) => {
        if (cancelled) return;
        const deduped = deduplicateChats(chats);
        adapterRef.current.commitFilterCache(
          'bugs',
          { chats: deduped, bugsHasMore: hasMore },
          { userId, applyToVisible: chatsFilter === 'bugs' }
        );
        adapterRef.current.replaceThreadIndex('bugs', deduped);
      })
      .catch(async () => {
        if (cancelled) return;
        const d = await chatInboxThreadIndex.load('bugs');
        if (d.length) {
          adapterRef.current.commitFilterCache(
            'bugs',
            { chats: deduplicateChats(d) },
            { userId, applyToVisible: chatsFilter === 'bugs' }
          );
        } else {
          adapterRef.current.commitFilterCache('bugs', { chats: [] }, { userId, applyToVisible: chatsFilter === 'bugs' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatsFilter, bugsFilter, fetchOps, userId, unreadFilterActive]);

  const prevUnreadFilterRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (chatsFilter !== 'bugs') {
      prevUnreadFilterRef.current = undefined;
      return;
    }
    if (prevUnreadFilterRef.current === unreadFilterActive) return;
    if (prevUnreadFilterRef.current === undefined && !unreadFilterActive) {
      prevUnreadFilterRef.current = false;
      return;
    }
    prevUnreadFilterRef.current = unreadFilterActive;
    adapterRef.current.invalidateFilterCache('bugs');
    let cancelled = false;
    fetchOps
      .fetchBugs(1, unreadFilterActive ? { ignoreBugsFilter: true } : undefined)
      .then(({ chats, hasMore }) => {
        if (cancelled) return;
        const deduped = deduplicateChats(chats);
        adapterRef.current.commitFilterCache(
          'bugs',
          { chats: deduped, bugsHasMore: hasMore },
          { userId, applyToVisible: chatsFilter === 'bugs' }
        );
        adapterRef.current.replaceThreadIndex('bugs', deduped);
      })
      .catch(async () => {
        if (cancelled) return;
        const d = await chatInboxThreadIndex.load('bugs');
        if (d.length) {
          adapterRef.current.commitFilterCache(
            'bugs',
            { chats: deduplicateChats(d) },
            { userId, applyToVisible: chatsFilter === 'bugs' }
          );
        } else {
          adapterRef.current.commitFilterCache('bugs', { chats: [] }, { userId, applyToVisible: chatsFilter === 'bugs' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chatsFilter, unreadFilterActive, fetchOps, userId]);

  const marketUnknownGroupFetchRef = useRef<string | null>(null);
  useEffect(() => {
    const data = lastChatUnreadCount as { contextType?: string; contextId?: string } | null;
    const ids = chatsRef.current.filter((c) => c.type === 'channel').map((c) => c.data.id);
    if (
      !shouldFetchMarketForUnknownGroupUnread(
        chatsFilter,
        data,
        ids,
        marketUnknownGroupFetchRef.current
      )
    ) {
      return;
    }
    marketUnknownGroupFetchRef.current = data!.contextId!;
    let cancelled = false;
    fetchOps.fetchMarket(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      adapterRef.current.replaceThreadIndex('market', deduped);
      adapterRef.current.commitFilterCache(
        'market',
        { chats: deduped, marketHasMore: hasMore },
        { userId, applyToVisible: true }
      );
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lastChatUnreadCount, chatsFilter, fetchOps, userId]);

  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? threads.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, threads]
  );

  const unreadStoreWarm = useUnreadStoreWarm();
  const displayedByContext = useUnreadStore((s) => s.displayedByContext);
  const usersSubtabUnread = useChatsSubtabUnreadBadge('users');
  const bugsSubtabUnread = useChatsSubtabUnreadBadge('bugs');
  const channelsSubtabUnread = useChatsSubtabUnreadBadge('channels');
  const marketSubtabUnread = useChatsSubtabUnreadBadge('market');
  const marketBuyerSellerUnreadFromStore = useMarketBuyerSellerUnreadBadges();

  const marketUnreadCounts = useMemo(
    () => (unreadStoreWarm ? adapterRef.current.getMarketUnreadCounts(marketChannelIds) : {}),
    [unreadStoreWarm, marketChannelIds]
  );

  const readModel = useMemo(
    () =>
      deriveChatInboxReadModel({
        threads,
        loading,
        refreshing,
        error: null,
        pagination,
        chatsFilter,
        unreadFilterActive,
        marketChatRole,
        debouncedSearchQuery,
        userId,
        subtabs: {
          users: usersSubtabUnread ?? 0,
          bugs: bugsSubtabUnread ?? 0,
          channels: channelsSubtabUnread ?? 0,
          market: marketSubtabUnread ?? 0,
        },
        unreadStoreWarm,
        displayedByContext,
        marketUnreadCounts,
        marketBuyerSellerUnreadFromStore: {
          buyer: marketBuyerSellerUnreadFromStore.buyer ?? 0,
          seller: marketBuyerSellerUnreadFromStore.seller ?? 0,
        },
      }),
    [
      threads,
      loading,
      refreshing,
      pagination,
      chatsFilter,
      unreadFilterActive,
      marketChatRole,
      debouncedSearchQuery,
      userId,
      usersSubtabUnread,
      bugsSubtabUnread,
      channelsSubtabUnread,
      marketSubtabUnread,
      unreadStoreWarm,
      displayedByContext,
      marketUnreadCounts,
      marketBuyerSellerUnreadFromStore,
    ]
  );

  const fetchCityUsers = useCallback(async () => {
    if (!user?.currentCity?.id) return;
    setCityUsersLoading(true);
    try {
      const players = await loadGlobalInvitablePlayers();
      setCityUsers(players);
    } catch {
      setCityUsers([]);
    } finally {
      setCityUsersLoading(false);
    }
  }, [user?.currentCity?.id]);

  const fetchContactsData = useCallback(async () => {
    if (!user?.currentCity?.id) return;
    setCityUsersLoading(true);
    try {
      const [usersRes, following, followers] = await Promise.all([
        loadGlobalInvitablePlayers(),
        favoritesApi.getFollowing().catch(() => []),
        favoritesApi.getFollowers().catch(() => []),
      ]);
      setCityUsers(usersRes);
      setFollowingUsers(following);
      setFollowersUsers(followers);
    } catch {
      setCityUsers([]);
      setFollowingUsers([]);
      setFollowersUsers([]);
    } finally {
      setCityUsersLoading(false);
    }
  }, [user?.currentCity?.id]);

  const fetchUsersSearchData = useCallback(async () => {
    const data = await fetchOps.fetchUsersSearchData();
    setSearchableUsersData({ activeChats: data.activeChats, cityUsers: data.cityUsers });
    return data;
  }, [fetchOps]);

  const handleContactClick = useCallback(
    async (
      contactUserId: string,
      onChatSelect?: (chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => void,
      searchQuery?: string
    ) => {
      if (!user) return;
      const chat = await adapterRef.current.getOrCreateUserChat(contactUserId);
      if (!chat) return;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
      if (chatsFilter === 'users' && otherUser) {
        adapterRef.current.patchRowsForFilter('users', (prevChats) => {
          const filteredChats = prevChats.filter(
            (item) => !(item.type === 'contact' && item.userId === contactUserId)
          );
          const lastMessageDate = chat.lastMessage ? new Date(getLastMessageTime(chat.lastMessage)) : null;
          const newChatItem: ChatItem = {
            type: 'user',
            data: chat,
            lastMessageDate,
            unreadCount: 0,
            otherUser,
          };
          const updatedChats = deduplicateChats([...filteredChats, newChatItem]);
          sortChatItems(updatedChats, 'users', user?.id);
          return updatedChats;
        });
      }
      onChatSelect?.(chat.id, 'user', {
        ...(searchQuery ? { searchQuery } : {}),
        userChat: chat,
      });
    },
    [user, chatsFilter]
  );

  const shouldLoadMore =
    (chatsFilter === 'bugs' && pagination.bugsHasMore && !pagination.bugsLoadingMore) ||
    (chatsFilter === 'users' && pagination.usersHasMore && !pagination.usersLoadingMore) ||
    (chatsFilter === 'channels' && pagination.channelsHasMore && !pagination.channelsLoadingMore) ||
    (chatsFilter === 'market' && pagination.marketHasMore && !pagination.marketLoadingMore);

  return {
    adapter: adapterRef.current,
    readModel,
    threads,
    loading,
    pagination,
    refresh,
    fetchChatsForFilter,
    loadMore,
    shouldLoadMore,
    searchData: {
      cityUsers,
      cityUsersLoading,
      searchableUsersData,
      followingUsers,
      followersUsers,
      fetchCityUsers,
      fetchContactsData,
      fetchUsersSearchData,
    },
    mutedChats,
    setMutedChats,
    handleContactClick,
    applyDraftToCache,
    getMergedDrafts,
    chatsRef,
  };
}

export { createProductionChatInboxAdapter } from './chatInboxProductionAdapter';
export { createFakeChatInboxAdapter } from './chatInboxFakeAdapter';
export type { ChatInboxAdapter, ChatInboxReadModel } from './types';
