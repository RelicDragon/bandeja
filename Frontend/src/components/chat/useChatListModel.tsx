import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import transliterate from '@sindresorhus/transliterate';
import { chatApi, getLastMessageTime, GroupChannel } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
import { getMarketChatDisplayTitle } from '@/utils/marketChatUtils';
import {
  deduplicateChats,
  getChatKey,
  calculateLastMessageDate,
  groupsToChatItems,
  gamesToChatItems,
  channelsToChatItems,
  applyDraftsToChatItems,
  type FilterCache
} from '@/utils/chatListHelpers';
import { favoritesApi } from '@/api/favorites';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { loadGlobalInvitablePlayers } from '@/utils/loadGlobalInvitablePlayers';
import { usePlayersStore } from '@/store/playersStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useNavigationStore } from '@/store/navigationStore';
import { BasicUser } from '@/types';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import {
  useChatsSubtabUnreadBadge,
  useMarketBuyerSellerUnreadBadges,
  useUnreadStoreWarm,
} from '@/hooks/useUnreadBridge';
import { chatListUnreadFilterCount } from '@/components/chat/chatListUnreadFilter';
import { resolveGameUnreadCounts, resolveGroupUnreadCounts, userChatUnreadCount } from '@/utils/unreadCountsFromStore';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { marketplaceApi } from '@/api/marketplace';
import { MarketItem } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import {
  collectChatListPresenceUserIds,
  collectSearchRowsPresenceUserIds,
  type ChatSearchRow,
} from '@/utils/chatListPresenceIds';
import { ChatItem, type ChatListProps, type ChatSelectNavOptions, type ChatType } from './chatListTypes';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import {
  loadThreadIndexForList,
  persistThreadIndexReplace,
  persistThreadIndexUpsert,
} from '@/services/chat/chatThreadIndex';
import {
  clearChatListModuleCacheWhenUserMismatch,
  type ChatsFilterType,
} from '@/components/chat/chatListModuleCache';
import { useChatListFeedStore } from '@/components/chat/chatListFeedStore';
import type { ChatListViewModel } from '@/components/chat/chatListViewModel.types';
import { useChatListSocketEffects } from './useChatListSocketEffects';
import { useChatListMergedDrafts } from '@/components/chat/useChatListMergedDrafts';
import { useChatListPrefetch } from '@/components/chat/useChatListPrefetch';
import { useChatListDexieSyncEffects } from '@/components/chat/useChatListDexieSyncEffects';
import { useChatListSearchUrlSync } from '@/components/chat/useChatListSearchUrlSync';
import { useChatListMarketUnread } from '@/components/chat/useChatListMarketUnread';
import { useChatListContactSections } from '@/components/chat/useChatListContactSections';
import { shouldEnterChatListLoadingState } from '@/components/chat/chatListLoadingGate';

export function useChatListModel({
  onChatSelect,
  isDesktop = false,
  selectedChatId,
  selectedChatType,
}: ChatListProps): ChatListViewModel {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { getMergedDrafts, applyDraftToCache } = useChatListMergedDrafts(user?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const chatsFilter = useNavigationStore((s) => s.chatsFilter);
  const bugsFilter = useNavigationStore((s) => s.bugsFilter);
  const openBugModal = useNavigationStore((s) => s.openBugModal);
  const setOpenBugModal = useNavigationStore((s) => s.setOpenBugModal);
  const viewingGameChatId = useNavigationStore((s) => s.viewingGameChatId);
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const listChatMessageSeq = useSocketEventsStore((state) => state.listChatMessageSeq);
  const listChatUnreadSeq = useSocketEventsStore((state) => state.listChatUnreadSeq);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastNewBug = useSocketEventsStore((state) => state.lastNewBug);
  const lastSyncCompletedAt = useChatSyncStore((state) => state.lastSyncCompletedAt);
  const chatListDexieBump = useChatSyncStore((state) => state.chatListDexieBump);
  const chats = useChatListFeedStore((s) => s.rows);
  const loading = useChatListFeedStore((s) => s.loading);
  const bugsHasMore = useChatListFeedStore((s) => s.pagination.bugs.hasMore);
  const bugsLoadingMore = useChatListFeedStore((s) => s.pagination.bugs.loadingMore);
  const usersHasMore = useChatListFeedStore((s) => s.pagination.users.hasMore);
  const usersLoadingMore = useChatListFeedStore((s) => s.pagination.users.loadingMore);
  const channelsHasMore = useChatListFeedStore((s) => s.pagination.channels.hasMore);
  const channelsLoadingMore = useChatListFeedStore((s) => s.pagination.channels.loadingMore);
  const marketHasMore = useChatListFeedStore((s) => s.pagination.market.hasMore);
  const marketLoadingMore = useChatListFeedStore((s) => s.pagination.market.loadingMore);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const prevViewingGameChatIdRef = useRef<string | null>(null);
  const feed = useChatListFeedStore.getState;

  const reapplyDraftsToList = useCallback(() => {
    if (!user?.id) return;
    if (
      chatsFilter !== 'users' &&
      chatsFilter !== 'bugs' &&
      chatsFilter !== 'channels' &&
      chatsFilter !== 'market'
    ) {
      return;
    }
    feed().invalidateDrafts();
    void (async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      const allDrafts = await getMergedDrafts(true);
      feed().reapplyDrafts(allDrafts, chatsFilter, user.id);
    })();
  }, [user?.id, chatsFilter, getMergedDrafts, feed]);

  useChatListPrefetch(user?.id, isOnline, chatsRef);
  const urlQuery = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(urlQuery);
  const debouncedSearchQuery = useDebounce(searchInput, 500);
  const skipUrlSyncRef = useRef(false);
  useChatListSearchUrlSync(urlQuery, skipUrlSyncRef, setSearchInput);
  const [contactsMode, setContactsMode] = useState(false);
  const [cityUsers, setCityUsers] = useState<BasicUser[]>([]);
  const [cityUsersLoading, setCityUsersLoading] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<BasicUser[]>([]);
  const [followersUsers, setFollowersUsers] = useState<BasicUser[]>([]);
  const [searchableUsersData, setSearchableUsersData] = useState<{ activeChats: ChatItem[]; cityUsers: BasicUser[] } | null>(null);
  const [listTransition, setListTransition] = useState<'idle' | 'out' | 'in'>('idle');
  const marketChatRole = (searchParams.get('role') === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller';
  const itemIdFromUrl = searchParams.get('item');
  const [selectedMarketItemForDrawer, setSelectedMarketItemForDrawer] = useState<MarketItem | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const listBodyScrollRef = useRef<HTMLDivElement>(null);

  const setMarketChatRole = useCallback(
    (role: 'buyer' | 'seller') => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('role', role);
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useChatListDexieSyncEffects({
    userId: user?.id,
    chatsFilter: chatsFilter as ChatsFilterType,
    contactsMode,
    debouncedSearchQuery,
    chatListDexieBump,
  });

  const { marketChannelIdsKey, marketUnreadCounts } = useChatListMarketUnread(chatsFilter, chats);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user?.id, fetchFavorites]);

  const fetchUsersSearchData = useCallback(async (): Promise<{ activeChats: ChatItem[]; cityUsers: BasicUser[]; usersHasMore: boolean }> => {
    if (!user) return { activeChats: [], cityUsers: [], usersHasMore: false };
    const { fetchUserChats } = usePlayersStore.getState();
    await fetchUserChats();
    const cityUsersData = await loadGlobalInvitablePlayers();
    const allDrafts = await getMergedDrafts();
    const { chats: userChats, unreadCounts } = usePlayersStore.getState();
    const blockedUserIds = user.blockedUserIds || [];
    const activeChats: ChatItem[] = [];
    Object.values(userChats).forEach(chat => {
      const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
      if (otherUserId && !blockedUserIds.includes(otherUserId)) {
        const draft = matchDraftToChat(allDrafts, 'USER', chat.id);
        const lastMessageDate = (chat.lastMessage || draft)
          ? calculateLastMessageDate(chat.lastMessage, draft, chat.updatedAt)
          : null;
        activeChats.push({
          type: 'user',
          data: chat,
          lastMessageDate,
          unreadCount: userChatUnreadCount(chat.id) || unreadCounts[chat.id] || 0,
          otherUser,
          draft: draft || null
        });
      }
    });
    try {
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', 1);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = await resolveGroupUnreadCounts(groupIds);
      const groupChatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      activeChats.push(...groupChatItems);
      const games = await chatApi.getUserChatGames();
      const gameIds = games.map((g) => g.id);
      const gameUnreads = await resolveGameUnreadCounts(gameIds);
      activeChats.push(...gamesToChatItems(games, gameUnreads, allDrafts));
      sortChatItems(activeChats, 'users', user?.id);
      const cityUsersArray = Array.isArray(cityUsersData) ? cityUsersData : [];
      return { activeChats, cityUsers: cityUsersArray, usersHasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersSearchData failed:', err);
      sortChatItems(activeChats, 'users', user?.id);
      return { activeChats, cityUsers: Array.isArray(cityUsersData) ? cityUsersData : [], usersHasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchUsersGroups = useCallback(async (page: number): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const allDrafts = await getMergedDrafts();
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', page);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = await resolveGroupUnreadCounts(groupIds);
      const chatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersGroups failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchBugs = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const bf = useNavigationStore.getState().bugsFilter;
      const filterParams = (bf.status || bf.type || bf.createdByMe)
        ? { status: bf.status, type: bf.type, createdByMe: bf.createdByMe }
        : undefined;
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('bugs', page, filterParams),
        getMergedDrafts()
      ]);
      const channelList = ((channelsRes.data || []) as GroupChannel[]);
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', { useUpdatedAtFallback: true, filterByIsGroup: true, allDrafts });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchBugs failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchChannels = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('channels', page),
        getMergedDrafts()
      ]);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'channels', { filterByIsChannel: true, allDrafts });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchChannels failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchMarket = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const [channelsRes, allDrafts] = await Promise.all([
        chatApi.getGroupChannels('market', page),
        getMergedDrafts()
      ]);
      const channelList = (channelsRes.data || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = await resolveGroupUnreadCounts(channelIds);
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'market', { filterByIsGroup: true, useUpdatedAtFallback: true, allDrafts });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchMarket failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchFilter = useCallback(
    async (filter: 'users' | 'bugs' | 'channels' | 'market') => {
      const user = useAuthStore.getState().user;
      if (!user) return;
      const bf = useNavigationStore.getState().bugsFilter;
      const bugsFilterParams = (bf.status || bf.type || bf.createdByMe)
        ? { status: bf.status, type: bf.type, createdByMe: bf.createdByMe }
        : undefined;

      if (filter === 'users') {
        const playersStore = usePlayersStore.getState();
        await playersStore.fetchUserChats();
        const cityUsersData = await loadGlobalInvitablePlayers();
        const allDrafts = await getMergedDrafts();
        const [usersGroupsRes, games] = await Promise.all([
          chatApi.getGroupChannels('users', 1),
          chatApi.getUserChatGames(),
        ]);
        const usersGroupList = (usersGroupsRes.data || []) as GroupChannel[];
        const groupIds = usersGroupList.map((g: GroupChannel) => g.id);
        const gameIds = games.map((g) => g.id);
        const [groupUnreads, gameUnreads] = await Promise.all([
          resolveGroupUnreadCounts(groupIds),
          resolveGameUnreadCounts(gameIds),
        ]);
        const { chats: userChats, unreadCounts } = usePlayersStore.getState();
        const blockedUserIds = user.blockedUserIds || [];
        const activeChats: ChatItem[] = [];
        Object.values(userChats).forEach(chat => {
          const otherUserId = chat.user1Id === user.id ? chat.user2Id : chat.user1Id;
          const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;
          if (otherUserId && !blockedUserIds.includes(otherUserId)) {
            const draft = matchDraftToChat(allDrafts, 'USER', chat.id);
            const lastMessageDate = (chat.lastMessage || draft)
              ? calculateLastMessageDate(chat.lastMessage, draft, chat.updatedAt)
              : null;
            activeChats.push({
              type: 'user',
              data: chat,
              lastMessageDate,
              unreadCount: userChatUnreadCount(chat.id) || unreadCounts[chat.id] || 0,
              otherUser,
              draft: draft || null
            });
          }
        });
        const usersGroupItems = groupsToChatItems(usersGroupList, groupUnreads, allDrafts, 'users', user?.id);
        activeChats.push(...usersGroupItems);
        activeChats.push(...gamesToChatItems(games, gameUnreads, allDrafts));
        const usersChatItems = deduplicateChats(sortChatItems(activeChats, 'users', user?.id));
        const cityUsersArray = Array.isArray(cityUsersData) ? cityUsersData : [];
        const cacheEntry: FilterCache = {
          chats: usersChatItems,
          cityUsers: cityUsersArray,
          usersHasMore: usersGroupsRes.pagination?.hasMore ?? false
        };
        useChatListFeedStore.getState().commitFilterCache('users', cacheEntry, { userId: user.id, applyToVisible: false });
        useChatListFeedStore.getState().setLastFetchTime(Date.now());
        void persistThreadIndexReplace('users', usersChatItems);
        return;
      }

      const allDrafts = await getMergedDrafts();
      if (filter === 'bugs') {
        const bugsRes = await chatApi.getGroupChannels('bugs', 1, bugsFilterParams);
        const channelList = (bugsRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads = await resolveGroupUnreadCounts(channelIds);
        const bugsChatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', {
          useUpdatedAtFallback: true,
          filterByIsGroup: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(bugsChatItems),
          bugsHasMore: bugsRes.pagination?.hasMore ?? false
        };
        useChatListFeedStore.getState().commitFilterCache('bugs', cacheEntry, { userId: user.id, applyToVisible: false });
        useChatListFeedStore.getState().setLastFetchTime(Date.now());
        void persistThreadIndexReplace('bugs', cacheEntry.chats);
        return;
      }
      if (filter === 'channels') {
        const channelsRes = await chatApi.getGroupChannels('channels', 1);
        const channelList = (channelsRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads = await resolveGroupUnreadCounts(channelIds);
        const channelsChatItems = channelsToChatItems(channelList, channelUnreads, 'channels', {
          filterByIsChannel: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(channelsChatItems),
          channelsHasMore: channelsRes.pagination?.hasMore ?? false
        };
        useChatListFeedStore.getState().commitFilterCache('channels', cacheEntry, { userId: user.id, applyToVisible: false });
        useChatListFeedStore.getState().setLastFetchTime(Date.now());
        void persistThreadIndexReplace('channels', cacheEntry.chats);
        return;
      }
      if (filter === 'market') {
        const marketRes = await chatApi.getGroupChannels('market', 1);
        const channelList = (marketRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads = await resolveGroupUnreadCounts(channelIds);
        const marketChatItems = channelsToChatItems(channelList, channelUnreads, 'market', {
          filterByIsGroup: true,
          useUpdatedAtFallback: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(marketChatItems),
          marketHasMore: marketRes.pagination?.hasMore ?? false
        };
        useChatListFeedStore.getState().commitFilterCache('market', cacheEntry, { userId: user.id, applyToVisible: false });
        useChatListFeedStore.getState().setLastFetchTime(Date.now());
        void persistThreadIndexReplace('market', cacheEntry.chats);
      }
    },
    [getMergedDrafts]
  );

  const runCoalescedFilterFetch = useCallback(
    async (filter: ChatsFilterType) => {
      const store = useChatListFeedStore.getState();
      let p = store.getInFlight(filter);
      if (!p) {
        p = (async () => {
          try {
            await fetchFilter(filter);
          } finally {
            useChatListFeedStore.getState().clearInFlight(filter);
          }
        })();
        store.registerInFlight(filter, p);
      }
      await p;
    },
    [fetchFilter]
  );

  const fetchChatsForFilter = useCallback(
    async (filterArg?: 'users' | 'bugs' | 'channels' | 'market') => {
      const filter = filterArg ?? useNavigationStore.getState().chatsFilter;
      if (filter !== 'users' && filter !== 'bugs' && filter !== 'channels' && filter !== 'market') return;
      try {
        await runCoalescedFilterFetch(filter);
      } catch (err) {
        console.error('fetchChatsForFilter failed:', err);
        return;
      }
      if (filter !== useNavigationStore.getState().chatsFilter) return;
      const cached = useChatListFeedStore.getState().getFilterCache(filter);
      if (!cached) return;
      useChatListFeedStore.getState().commitFilterCache(filter, cached, {
        userId: useAuthStore.getState().user?.id,
        applyToVisible: true,
      });
      if (filter === 'users') setMutedChats({});
      if (cached.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
      }
    },
    [runCoalescedFilterFetch]
  );

  useEffect(() => {
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') return;
    if (!user?.id) return;
    clearChatListModuleCacheWhenUserMismatch(user.id);
    useChatListFeedStore.getState().setActiveFilter(chatsFilter);
    const applyCacheToState = (cached: FilterCache, chatsWithDrafts?: ChatItem[]) => {
      const chatsToApply = chatsWithDrafts ?? cached.chats;
      const entry: FilterCache = { ...cached, chats: chatsToApply };
      useChatListFeedStore.getState().commitFilterCache(chatsFilter, entry, { userId: user.id, applyToVisible: true });
      if (chatsFilter === 'users') setMutedChats({});
      if (cached.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: chatsToApply, cityUsers: cached.cityUsers });
      }
    };
    const applyCacheWithDrafts = async (cached: FilterCache) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      const allDrafts = await getMergedDrafts(true);
      const withDrafts = applyDraftsToChatItems(
        deduplicateChats(cached.chats),
        allDrafts,
        chatsFilter,
        user.id
      );
      applyCacheToState(cached, withDrafts);
      useChatListFeedStore.getState().setLoading(false);
    };
    const feedState = useChatListFeedStore.getState();
    const cached = feedState.getFilterCache(chatsFilter);
    if (cached && feedState.userId === user.id) {
      void applyCacheWithDrafts(cached);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        let showedDisk = false;
        try {
          const fromUsersDex = await loadThreadIndexForList(chatsFilter);
          const fromGamesDex =
            chatsFilter === 'users' ? await loadThreadIndexForList('games') : [];
          const fromDex = deduplicateChats([...fromUsersDex, ...fromGamesDex]);
          if (!cancelled && fromDex.length > 0) {
            showedDisk = true;
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 0);
            });
            const allDrafts = await getMergedDrafts(true);
            const dexChats = applyDraftsToChatItems(
              deduplicateChats(fromDex),
              allDrafts,
              chatsFilter,
              user.id
            );
            const dexOnly: FilterCache = { chats: dexChats };
            if (chatsFilter === 'users') {
              dexOnly.cityUsers = [];
              dexOnly.usersHasMore = false;
            }
            if (chatsFilter === 'bugs') dexOnly.bugsHasMore = false;
            if (chatsFilter === 'channels') dexOnly.channelsHasMore = false;
            if (chatsFilter === 'market') dexOnly.marketHasMore = false;
            applyCacheToState(dexOnly);
            useChatListFeedStore.getState().setLoading(false);
          } else if (!cancelled && fromDex.length === 0 && !useNetworkStore.getState().isOnline) {
            showedDisk = true;
            const empty: FilterCache = { chats: [] };
            if (chatsFilter === 'users') {
              empty.cityUsers = [];
              empty.usersHasMore = false;
            }
            if (chatsFilter === 'bugs') empty.bugsHasMore = false;
            if (chatsFilter === 'channels') empty.channelsHasMore = false;
            if (chatsFilter === 'market') empty.marketHasMore = false;
            applyCacheToState(empty);
            useChatListFeedStore.getState().setLoading(false);
            return;
          }
        } catch {
          /* ignore */
        }
        if (showedDisk && !useNetworkStore.getState().isOnline) return;
        if (showedDisk && useNetworkStore.getState().isOnline) {
          const currentFilter = chatsFilter;
          void (async () => {
            try {
              await runCoalescedFilterFetch(currentFilter);
            } catch (err) {
              console.error('Failed to fetch chats:', err);
            }
            if (cancelled) return;
            const c = useChatListFeedStore.getState().getFilterCache(currentFilter);
            if (c && useChatListFeedStore.getState().userId === user.id) {
              if (useNavigationStore.getState().chatsFilter !== currentFilter) return;
              useChatListFeedStore.getState().commitFilterCache(currentFilter, c, { userId: user.id, applyToVisible: true });
              if (currentFilter === 'users') setMutedChats({});
              if (c.cityUsers) {
                setCityUsers(c.cityUsers);
                setSearchableUsersData({ activeChats: c.chats, cityUsers: c.cityUsers });
              }
            }
          })();
          return;
        }
        const inflight = useChatListFeedStore.getState().getInFlight(chatsFilter);
        if (inflight) {
          await inflight;
          if (cancelled) return;
          const after = useChatListFeedStore.getState().getFilterCache(chatsFilter);
          if (after && useChatListFeedStore.getState().userId === user.id) {
            applyCacheToState(after);
            useChatListFeedStore.getState().setLoading(false);
            return;
          }
        }
        if (shouldEnterChatListLoadingState(showedDisk, chatsRef.current.length)) {
          useChatListFeedStore.getState().setLoading(true);
        }
        const currentFilter = chatsFilter;
        await runCoalescedFilterFetch(currentFilter);
        if (cancelled) return;
        const c = useChatListFeedStore.getState().getFilterCache(chatsFilter);
        if (c) applyCacheToState(c);
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch chats:', err);
      } finally {
        if (!cancelled) useChatListFeedStore.getState().setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [fetchFilter, chatsFilter, user?.id, runCoalescedFilterFetch, getMergedDrafts]);

  useEffect(() => {
    const prev = prevViewingGameChatIdRef.current;
    prevViewingGameChatIdRef.current = viewingGameChatId;
    if (prev && !viewingGameChatId) {
      reapplyDraftsToList();
    }
  }, [viewingGameChatId, reapplyDraftsToList]);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') {
      return;
    }
    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      if (cancelled) return;
      const allDrafts = await getMergedDrafts(true);
      if (cancelled || allDrafts.length === 0) return;
      useChatListFeedStore.getState().reapplyDrafts(allDrafts, chatsFilter, user.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user?.id, chatsFilter, getMergedDrafts]);

  const prevBugsFilterRef = useRef(bugsFilter);
  useEffect(() => {
    if (chatsFilter !== 'bugs') return;
    if (prevBugsFilterRef.current === bugsFilter) return;
    prevBugsFilterRef.current = bugsFilter;
    useChatListFeedStore.getState().invalidateFilterCache('bugs');
    let cancelled = false;
    fetchBugs(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      useChatListFeedStore.getState().commitFilterCache(
        'bugs',
        { chats: deduped, bugsHasMore: hasMore },
        { userId: user?.id, applyToVisible: chatsFilter === 'bugs' }
      );
      void persistThreadIndexReplace('bugs', deduped);
    }).catch(async () => {
      if (cancelled) return;
      const d = await loadThreadIndexForList('bugs');
      if (d.length) {
        useChatListFeedStore.getState().commitFilterCache(
          'bugs',
          { chats: deduplicateChats(d) },
          { userId: user?.id, applyToVisible: chatsFilter === 'bugs' }
        );
      } else {
        useChatListFeedStore.getState().commitFilterCache('bugs', { chats: [] }, { userId: user?.id, applyToVisible: chatsFilter === 'bugs' });
      }
    });
    return () => { cancelled = true; };
  }, [chatsFilter, bugsFilter, fetchBugs, user?.id]);

  const runFeedLoadMore = useCallback(
    async (
      filter: ChatsFilterType,
      isActive: boolean,
      loadingMore: boolean,
      hasMore: boolean,
      fetcher: (page: number) => Promise<{ chats: ChatItem[]; hasMore: boolean }>,
      afterMore?: (more: ChatItem[]) => void
    ) => {
      if (!isActive || loadingMore || !hasMore) return;
      const store = useChatListFeedStore.getState();
      store.setPagination(filter, { loadingMore: true });
      try {
        const nextPage = store.pagination[filter].page + 1;
        const { chats: moreChats, hasMore: nextHasMore } = await fetcher(nextPage);
        afterMore?.(moreChats);
        store.mergeLoadMoreRows(filter, moreChats, nextHasMore);
      } finally {
        useChatListFeedStore.getState().setPagination(filter, { loadingMore: false });
      }
    },
    []
  );

  const loadMoreBugs = useCallback(async () => {
    await runFeedLoadMore('bugs', chatsFilter === 'bugs', bugsLoadingMore, bugsHasMore, fetchBugs, (more) =>
      void persistThreadIndexUpsert('bugs', more)
    );
  }, [chatsFilter, bugsLoadingMore, bugsHasMore, fetchBugs, runFeedLoadMore]);

  const loadMoreUsers = useCallback(async () => {
    await runFeedLoadMore('users', chatsFilter === 'users', usersLoadingMore, usersHasMore, fetchUsersGroups, (more) =>
      void persistThreadIndexUpsert('users', more)
    );
  }, [chatsFilter, usersLoadingMore, usersHasMore, fetchUsersGroups, runFeedLoadMore]);

  const loadMoreChannels = useCallback(async () => {
    await runFeedLoadMore('channels', chatsFilter === 'channels', channelsLoadingMore, channelsHasMore, fetchChannels, (more) =>
      void persistThreadIndexUpsert('channels', more)
    );
  }, [chatsFilter, channelsLoadingMore, channelsHasMore, fetchChannels, runFeedLoadMore]);

  const loadMoreMarket = useCallback(async () => {
    await runFeedLoadMore('market', chatsFilter === 'market', marketLoadingMore, marketHasMore, fetchMarket, (more) =>
      void persistThreadIndexUpsert('market', more)
    );
  }, [chatsFilter, marketLoadingMore, marketHasMore, fetchMarket, runFeedLoadMore]);

  const shouldLoadMore = (chatsFilter === 'bugs' && bugsHasMore && !bugsLoadingMore) ||
    (chatsFilter === 'users' && usersHasMore && !usersLoadingMore) ||
    (chatsFilter === 'channels' && channelsHasMore && !channelsLoadingMore) ||
    (chatsFilter === 'market' && marketHasMore && !marketLoadingMore);
  const loadMore = chatsFilter === 'bugs' ? loadMoreBugs : chatsFilter === 'users' ? loadMoreUsers : chatsFilter === 'market' ? loadMoreMarket : loadMoreChannels;

  useEffect(() => {
    const data = lastChatUnreadCount;
    if (!data || data.contextType !== 'GROUP') return;
    const ids =
      chatsFilter === 'market'
        ? chatsRef.current.filter((c) => c.type === 'channel').map((c) => c.data.id)
        : [];
    if (ids.includes(data.contextId)) return;
    let cancelled = false;
    fetchMarket(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      void persistThreadIndexReplace('market', deduped);
      useChatListFeedStore.getState().commitFilterCache(
        'market',
        { chats: deduped, marketHasMore: hasMore },
        { userId: user?.id, applyToVisible: chatsFilter === 'market' }
      );
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lastChatUnreadCount, marketChannelIdsKey, chatsFilter, fetchMarket, user?.id]);

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

  const handleContactsToggle = useCallback(() => {
    if (contactsMode) {
      setListTransition('out');
      setTimeout(() => {
        setContactsMode(false);
        skipUrlSyncRef.current = true;
        setSearchInput('');
        setSearchParams((p) => {
          const next = new URLSearchParams(p);
          next.delete('q');
          return next;
        }, { replace: true });
        setListTransition('in');
        setTimeout(() => setListTransition('idle'), 300);
      }, 250);
    } else {
      setListTransition('out');
      setTimeout(() => {
        setContactsMode(true);
        fetchContactsData();
        setListTransition('in');
        setTimeout(() => setListTransition('idle'), 300);
      }, 250);
    }
  }, [contactsMode, fetchContactsData, setSearchParams]);

  useEffect(() => {
    if (chatsFilter !== 'users') {
      setContactsMode(false);
    }
  }, [chatsFilter]);

  useEffect(() => {
    if (chatsFilter !== 'bugs') setBugsFilterPanelOpen(false);
  }, [chatsFilter]);

  useEffect(() => {
    setUnreadFilterActive(false);
  }, [chatsFilter]);

  useEffect(() => {
    if (chatsFilter !== 'users' || !debouncedSearchQuery.trim() || contactsMode) return;
    const cached = useChatListFeedStore.getState().getFilterCache('users')?.cityUsers;
    if (cached?.length) return;
    fetchCityUsers();
  }, [chatsFilter, debouncedSearchQuery, contactsMode, fetchCityUsers]);

  useEffect(() => {
    if (chatsFilter === 'bugs') setSearchableUsersData(null);
    else if (chatsFilter === 'channels' && debouncedSearchQuery.trim().length >= 2 && !searchableUsersData) {
      fetchUsersSearchData().then((data) => setSearchableUsersData(data)).catch(() => setSearchableUsersData(null));
    }
  }, [chatsFilter, debouncedSearchQuery, searchableUsersData, fetchUsersSearchData]);

  useChatListSocketEffects({
    chatsFilter,
    isDesktop,
    selectedChatId,
    selectedChatType,
    userId: user?.id,
    listChatMessageSeq,
    listChatUnreadSeq,
    lastSyncCompletedAt,
    lastNewBug,
    fetchChatsForFilter,
    fetchBugs,
    applyDraftToCache,
    chatsRef,
  });

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
      await fetchChatsForFilter(chatsFilter);
    }
  }, [fetchChatsForFilter, chatsFilter]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading || isDesktop,
  });

  const handleBugCreated = useCallback((groupChannelId?: string) => {
    setShowBugModal(false);
    if (chatsFilter === 'bugs') {
      fetchChatsForFilter('bugs');
    }
    if (groupChannelId && onChatSelect) {
      onChatSelect(groupChannelId, 'channel');
    }
  }, [chatsFilter, fetchChatsForFilter, onChatSelect]);

  const handleChatClick = useCallback((chatId: string, chatType: ChatType, options?: ChatSelectNavOptions) => {
    onChatSelect?.(chatId, chatType, options);
  }, [onChatSelect]);

  const [pinningId, setPinningId] = useState<string | null>(null);
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});
  const [togglingMuteId, setTogglingMuteId] = useState<string | null>(null);

  const handleMuteUserChat = useCallback(
    async (chatId: string, isMuted: boolean) => {
      setTogglingMuteId(chatId);
      try {
        if (isMuted) {
          await chatApi.unmuteChat('USER', chatId);
          setMutedChats((prev) => ({ ...prev, [chatId]: false }));
        } else {
          await chatApi.muteChat('USER', chatId);
          setMutedChats((prev) => ({ ...prev, [chatId]: true }));
        }
      } catch (e) {
        toast.error(t('chat.muteFailed', { defaultValue: 'Failed to update mute' }));
      } finally {
        setTogglingMuteId(null);
      }
    },
    [t]
  );

  const handleMuteGroupChannel = useCallback(
    async (channelId: string, isMuted: boolean) => {
      setTogglingMuteId(channelId);
      try {
        if (isMuted) {
          await chatApi.unmuteChat('GROUP', channelId);
          setMutedChats((prev) => ({ ...prev, [channelId]: false }));
        } else {
          await chatApi.muteChat('GROUP', channelId);
          setMutedChats((prev) => ({ ...prev, [channelId]: true }));
        }
      } catch (e) {
        toast.error(t('chat.muteFailed', { defaultValue: 'Failed to update mute' }));
      } finally {
        setTogglingMuteId(null);
      }
    },
    [t]
  );

  const handlePinUserChat = useCallback(
    async (chatId: string, isPinned: boolean) => {
      setPinningId(chatId);
      try {
        if (isPinned) await chatApi.unpinUserChat(chatId);
        else await chatApi.pinUserChat(chatId);
        usePlayersStore.getState().invalidateUserChatsCache();
        useChatListFeedStore.getState().invalidateFilterCache('users');
        await fetchChatsForFilter('users');
      } catch (e) {
        const msg = (e as AxiosError<{ message?: string }>)?.response?.data?.message;
        if (msg === 'MAX_PINNED_CHATS') {
          toast.error(t('chat.maxPinnedChatsReached', { max: MAX_PINNED_CHATS }));
        } else {
          toast.error(isPinned ? t('chat.unpinChatFailed') : t('chat.pinChatFailed'));
        }
      } finally {
        setPinningId(null);
      }
    },
    [fetchChatsForFilter, t]
  );

  const handlePinGroupChannel = useCallback(
    async (channelId: string, isPinned: boolean) => {
      setPinningId(channelId);
      try {
        if (isPinned) await chatApi.unpinGroupChannel(channelId);
        else await chatApi.pinGroupChannel(channelId);
        usePlayersStore.getState().invalidateUserChatsCache();
        useChatListFeedStore.getState().invalidateFilterCache('users');
        await fetchChatsForFilter('users');
      } catch (e) {
        const msg = (e as AxiosError<{ message?: string }>)?.response?.data?.message;
        if (msg === 'MAX_PINNED_CHATS') {
          toast.error(t('chat.maxPinnedChatsReached', { max: MAX_PINNED_CHATS }));
        } else {
          toast.error(isPinned ? t('chat.unpinChatFailed') : t('chat.pinChatFailed'));
        }
      } finally {
        setPinningId(null);
      }
    },
    [fetchChatsForFilter, t]
  );

  const handleCreateListing = useCallback(() => {
    navigate('/marketplace/create');
  }, [navigate]);

  const normalizeString = (str: string) => {
    return transliterate(str).toLowerCase();
  };

  const activeChats = useMemo(() => {
    return chats.filter((c) => c.type === 'user' || c.type === 'group' || c.type === 'game') as ChatItem[];
  }, [chats]);

  const matchesSearch = useCallback((title: string) => {
    if (!debouncedSearchQuery.trim()) return true;
    return normalizeString(title).includes(normalizeString(debouncedSearchQuery));
  }, [debouncedSearchQuery]);

  const matchesMarketSearch = useCallback(
    (chat: ChatItem) => {
      if (chat.type !== 'channel' || !chat.data.marketItemId) return false;
      const title = getMarketChatDisplayTitle(chat.data, marketChatRole);
      return matchesSearch(title);
    },
    [marketChatRole, matchesSearch]
  );

  const filteredActiveChats = useMemo(() => {
    const source = chatsFilter === 'channels' ? (searchableUsersData?.activeChats ?? []) : activeChats;
    if (chatsFilter !== 'users' && chatsFilter !== 'channels') return [];
    if (!debouncedSearchQuery.trim()) return chatsFilter === 'users' ? activeChats : [];
    return source.filter((chat) => matchesSearch(getChatTitle(chat, user?.id || '')));
  }, [activeChats, searchableUsersData?.activeChats, debouncedSearchQuery, chatsFilter, user?.id, matchesSearch]);

  const filteredCityUsers = useMemo(() => {
    const source = chatsFilter === 'channels' ? (searchableUsersData?.cityUsers ?? []) : cityUsers;
    if (chatsFilter !== 'users' && chatsFilter !== 'channels') return [];
    if (!debouncedSearchQuery.trim()) return chatsFilter === 'users' ? cityUsers : [];
    return source.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      return matchesSearch(fullName);
    });
  }, [cityUsers, searchableUsersData?.cityUsers, debouncedSearchQuery, chatsFilter, matchesSearch]);

  const contactSections = useChatListContactSections(cityUsers, followingUsers, followersUsers);

  const activeChatUserIds = useMemo(() => {
    return new Set(
      filteredActiveChats
        .filter((c): c is Extract<ChatItem, { type: 'user' }> => c.type === 'user')
        .map((c) => (c.data.user1Id === user?.id ? c.data.user2Id : c.data.user1Id))
    );
  }, [filteredActiveChats, user?.id]);

  const cityUserIds = useMemo(() => new Set(filteredCityUsers.map((u) => u.id)), [filteredCityUsers]);

  const filteredCityUsersExcludingActive = useMemo(() => {
    return filteredCityUsers.filter((u) => !activeChatUserIds.has(u.id));
  }, [filteredCityUsers, activeChatUserIds]);

  const filteredActiveChatsExcludingUsers = useMemo(() => {
    return filteredActiveChats.filter((c) => {
      if (c.type !== 'user') return true;
      const otherId = c.data.user1Id === user?.id ? c.data.user2Id : c.data.user1Id;
      return !cityUserIds.has(otherId);
    });
  }, [filteredActiveChats, cityUserIds, user?.id]);

  const isSearchMode = debouncedSearchQuery.trim().length > 0 && (chatsFilter === 'users' || chatsFilter === 'channels' || chatsFilter === 'bugs' || chatsFilter === 'market');

  const handleContactClick = useCallback(async (userId: string) => {
    if (!user) return;

    const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(userId);
    if (!chat) return;

    const updatedUnreadCounts = usePlayersStore.getState().unreadCounts;
    const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;

    if (chatsFilter === 'users' && otherUser) {
      useChatListFeedStore.getState().patchRowsForFilter('users', (prevChats) => {
        const filteredChats = prevChats.filter(
          (item) => !(item.type === 'contact' && item.userId === userId)
        );

        const lastMessageDate = chat.lastMessage
          ? new Date(getLastMessageTime(chat.lastMessage))
          : null;

        const newChatItem: ChatItem = {
          type: 'user',
          data: chat,
          lastMessageDate,
          unreadCount: updatedUnreadCounts[chat.id] || 0,
          otherUser,
        };

        const updatedChats = deduplicateChats([...filteredChats, newChatItem]);
        sortChatItems(updatedChats, 'users', user?.id);
        return updatedChats;
      });
    }

    onChatSelect?.(chat.id, 'user', {
      ...(isSearchMode ? { searchQuery: debouncedSearchQuery.trim() } : {}),
      userChat: chat,
    });
  }, [user, chatsFilter, onChatSelect, isSearchMode, debouncedSearchQuery]);

  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [gamesExpanded, setGamesExpanded] = useState(true);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [bugsExpanded, setBugsExpanded] = useState(true);
  const [marketListingsExpanded, setMarketListingsExpanded] = useState(true);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugsFilterPanelOpen, setBugsFilterPanelOpen] = useState(true);
  const [unreadFilterActive, setUnreadFilterActive] = useState(false);

  const marketBuyerSellerUnreadFromStore = useMarketBuyerSellerUnreadBadges();
  const marketBuyerSellerUnreadLegacy = useMemo(() => {
    let buyer = 0;
    let seller = 0;
    chats
      .filter((c): c is ChatItem & { type: 'channel'; data: GroupChannel } => c.type === 'channel' && !!(c.data as GroupChannel).marketItemId)
      .forEach((c) => {
        const count = marketUnreadCounts[(c.data as GroupChannel).id] ?? c.unreadCount ?? 0;
        if ((c.data as GroupChannel).buyerId === user?.id) buyer += count;
        if ((c.data as GroupChannel).marketItem?.sellerId === user?.id) seller += count;
      });
    return { buyer, seller };
  }, [chats, marketUnreadCounts, user?.id]);
  const unreadStoreWarm = useUnreadStoreWarm();
  const marketBuyerSellerUnread = unreadStoreWarm
    ? marketBuyerSellerUnreadFromStore
    : marketBuyerSellerUnreadLegacy;

  const marketFilteredByRoleAndSearch = useMemo(() => {
    if (chatsFilter !== 'market') return [];
    const roleFiltered = chats.filter(
      (c) =>
        c.type === 'channel' &&
        c.data.marketItemId &&
        (marketChatRole === 'buyer' ? c.data.buyerId === user?.id : c.data.marketItem?.sellerId === user?.id)
    );
    const searchFiltered = debouncedSearchQuery.trim()
      ? roleFiltered.filter(matchesMarketSearch)
      : roleFiltered;
    const sorted = [...searchFiltered];
    sortChatItems(sorted, 'market');
    return sorted.map((c) =>
      c.type === 'channel'
        ? { ...c, unreadCount: marketUnreadCounts[c.data.id] ?? c.unreadCount }
        : c
    ) as ChatItem[];
  }, [chatsFilter, chats, marketChatRole, user?.id, debouncedSearchQuery, matchesMarketSearch, marketUnreadCounts]);

  const usersSubtabUnread = useChatsSubtabUnreadBadge('users');
  const bugsSubtabUnread = useChatsSubtabUnreadBadge('bugs');
  const channelsSubtabUnread = useChatsSubtabUnreadBadge('channels');
  const marketSubtabUnread = useChatsSubtabUnreadBadge('market');

  const unreadChatsCount = useMemo(
    () =>
      chatListUnreadFilterCount(unreadStoreWarm, chatsFilter, {
        users: usersSubtabUnread,
        bugs: bugsSubtabUnread,
        channels: channelsSubtabUnread,
        market: marketSubtabUnread,
      }),
    [
      chatsFilter,
      unreadStoreWarm,
      usersSubtabUnread,
      bugsSubtabUnread,
      channelsSubtabUnread,
      marketSubtabUnread,
    ]
  );
  useEffect(() => {
    if (unreadChatsCount <= 0) setUnreadFilterActive(false);
  }, [unreadChatsCount]);

  const displayedChats = useMemo(() => {
    if (chatsFilter === 'market') {
      if (!unreadFilterActive) return marketFilteredByRoleAndSearch;
      return marketFilteredByRoleAndSearch.filter((c) => ('unreadCount' in c ? (c.unreadCount ?? 0) : 0) > 0);
    }
    if (!unreadFilterActive) return chats;
    return chats.filter(
      (c) =>
        (c.type === 'user' || c.type === 'group' || c.type === 'channel' || c.type === 'game') &&
        (c.unreadCount ?? 0) > 0
    );
  }, [chatsFilter, chats, unreadFilterActive, marketFilteredByRoleAndSearch]);

  useLayoutEffect(() => {
    if (!shouldLoadMore || loading) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const root = listBodyScrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: root ?? null, rootMargin: '100px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    chatsFilter,
    shouldLoadMore,
    loadMore,
    loading,
    displayedChats.length,
    isSearchMode,
    contactsMode,
    marketChatRole,
  ]);

  const pinnedCountUsers = useMemo(() => {
    if (chatsFilter !== 'users') return 0;
    return chats.filter((c) => (c.type === 'user' || c.type === 'group') && c.data.isPinned).length;
  }, [chatsFilter, chats]);

  const marketGroupedByItem = useMemo(() => {
    if (chatsFilter !== 'market' || marketChatRole !== 'seller') return null;
    const map = new Map<string, { itemId: string; title: string; thumb?: string; marketItem?: MarketItem; channels: ChatItem[] }>();
    displayedChats.forEach((c) => {
      if (c.type !== 'channel' || !('marketItemId' in c.data) || !c.data.marketItemId) return;
      const key = c.data.marketItemId;
      const gc = c.data as GroupChannel;
      if (!map.has(key)) {
        map.set(key, {
          itemId: key,
          title: gc.marketItem?.title ?? '',
          thumb: gc.marketItem?.mediaUrls?.[0],
          marketItem: gc.marketItem,
          channels: []
        });
      }
      map.get(key)!.channels.push(c);
    });
    return Array.from(map.values()).sort((a, b) => {
      const channelTime = (ch: (typeof a.channels)[number]) =>
        ch.lastMessageDate ? ch.lastMessageDate.getTime() : new Date((ch as Extract<(typeof a.channels)[number], { type: 'channel' }>).data.updatedAt).getTime();
      const aMax = Math.max(...a.channels.map(channelTime));
      const bMax = Math.max(...b.channels.map(channelTime));
      return bMax - aMax;
    });
  }, [chatsFilter, marketChatRole, displayedChats]);



  const openMarketItemDrawer = useCallback((item: MarketItem) => {
    setSelectedMarketItemForDrawer(item);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.set('item', item.id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const closeMarketItemDrawer = useCallback(() => {
    setSelectedMarketItemForDrawer(null);
    setSearchParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('item');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleMarketItemGroupClick = useCallback(async (group: { itemId: string; marketItem?: MarketItem }) => {
    if (group.marketItem) {
      openMarketItemDrawer(group.marketItem);
      return;
    }
    try {
      const res = await marketplaceApi.getMarketItemById(group.itemId);
      openMarketItemDrawer(res.data);
    } catch {
      setSelectedMarketItemForDrawer(null);
    }
  }, [openMarketItemDrawer]);

  useEffect(() => {
    if (chatsFilter !== 'market' || !itemIdFromUrl) {
      if (!itemIdFromUrl) setSelectedMarketItemForDrawer(null);
      return;
    }
    if (selectedMarketItemForDrawer?.id === itemIdFromUrl) return;
    let cancelled = false;
    marketplaceApi.getMarketItemById(itemIdFromUrl).then((res) => {
      if (!cancelled) setSelectedMarketItemForDrawer(res.data);
    }).catch(() => {
      if (!cancelled) setSearchParams((p) => { const n = new URLSearchParams(p); n.delete('item'); return n; }, { replace: true });
    });
    return () => { cancelled = true; };
  }, [chatsFilter, itemIdFromUrl, selectedMarketItemForDrawer?.id, setSearchParams]);

  useEffect(() => {
    if (openBugModal && chatsFilter === 'bugs') {
      setShowBugModal(true);
      setOpenBugModal(false);
    }
  }, [openBugModal, chatsFilter, setOpenBugModal]);

  const [activeChatsExpanded, setActiveChatsExpanded] = useState(true);
  const [usersExpanded, setUsersExpanded] = useState(true);

  const displayChats = useMemo(() => {
    if (!isSearchMode) return [];
    const usersSection = { type: 'section' as const, label: 'users' as const };
    const activeSection = { type: 'section' as const, label: 'active' as const };
    const items: Array<
      | { type: 'section'; label: 'users' | 'active' }
      | { type: 'chat'; data: ChatItem }
      | { type: 'contact'; user: BasicUser }
    > = [];
    if (contactsMode) {
      if (filteredCityUsers.length > 0) {
        items.push(usersSection);
        filteredCityUsers.forEach((u) => items.push({ type: 'contact', user: u }));
      }
      if (filteredActiveChatsExcludingUsers.length > 0) {
        items.push(activeSection);
        filteredActiveChatsExcludingUsers.forEach((c) => items.push({ type: 'chat', data: c }));
      }
    } else {
      if (filteredActiveChats.length > 0) {
        items.push(activeSection);
        filteredActiveChats.forEach((c) => items.push({ type: 'chat', data: c }));
      }
      if (filteredCityUsersExcludingActive.length > 0) {
        items.push(usersSection);
        filteredCityUsersExcludingActive.forEach((u) => items.push({ type: 'contact', user: u }));
      }
    }
    return items;
  }, [isSearchMode, contactsMode, filteredActiveChats, filteredActiveChatsExcludingUsers, filteredCityUsers, filteredCityUsersExcludingActive]);

  const listPresenceUserIds = useMemo(() => {
    if (loading) return [];
    if (isSearchMode) return collectSearchRowsPresenceUserIds(displayChats as ChatSearchRow[], user?.id);
    if (chatsFilter === 'market' && marketGroupedByItem) {
      const flat = marketGroupedByItem.flatMap((g) => g.channels);
      return collectChatListPresenceUserIds(flat, user?.id);
    }
    return collectChatListPresenceUserIds(displayedChats, user?.id);
  }, [loading, isSearchMode, displayChats, displayedChats, user?.id, chatsFilter, marketGroupedByItem]);

  usePresenceSubscription(
    loading ? 'chat-list:loading' : isSearchMode ? `chat-list-search:${chatsFilter}` : `chat-list:${chatsFilter}`,
    listPresenceUserIds
  );

  const showContactsEmpty = contactsMode && chatsFilter === 'users' && !isSearchMode && !cityUsersLoading && cityUsers.length === 0;
  const showChatsEmpty = !contactsMode && !isSearchMode && (chatsFilter === 'market' ? displayedChats.length === 0 : chats.length === 0) && !loading;

  return {
    t,
    isDesktop,
    user: user ?? null,
    feed: {
      loading,
      chatsFilter: chatsFilter as ChatsFilterType,
      displayedChats,
      chats,
      bugsHasMore,
      usersHasMore,
      channelsHasMore,
      marketHasMore,
      bugsLoadingMore,
      usersLoadingMore,
      channelsLoadingMore,
      marketLoadingMore,
      loadMoreSentinelRef,
      listBodyScrollRef,
      showChatsEmpty,
      pinnedCountUsers,
      getChatKey,
    },
    pullRefresh: {
      isRefreshing,
      pullDistance,
      pullProgress,
    },
    search: {
      searchInput,
      setSearchInput,
      debouncedSearchQuery,
      isSearchMode,
      displayChats,
      contactsMode,
      cityUsersLoading,
      showContactsEmpty,
      unreadChatsCount,
      unreadFilterActive,
      setUnreadFilterActive,
      skipUrlSyncRef,
      setSearchParams,
    },
    market: {
      marketChatRole,
      setMarketChatRole,
      marketBuyerSellerUnread,
      marketGroupedByItem,
      selectedMarketItemForDrawer,
      closeMarketItemDrawer,
      handleMarketItemGroupClick,
      handleCreateListing,
    },
    contacts: {
      contactSections,
      handleContactsToggle,
      handleContactClick,
      listTransition,
    },
    sections: {
      activeChatsExpanded,
      setActiveChatsExpanded,
      usersExpanded,
      setUsersExpanded,
      messagesExpanded,
      setMessagesExpanded,
      gamesExpanded,
      setGamesExpanded,
      channelsExpanded,
      setChannelsExpanded,
      bugsExpanded,
      setBugsExpanded,
      marketListingsExpanded,
      setMarketListingsExpanded,
    },
    actions: {
      handleChatClick,
      handlePinUserChat,
      handlePinGroupChannel,
      handleMuteUserChat,
      handleMuteGroupChannel,
      pinningId,
      mutedChats,
      togglingMuteId,
    },
    modals: {
      showBugModal,
      setShowBugModal,
      handleBugCreated,
      bugsFilterPanelOpen,
      setBugsFilterPanelOpen,
    },
    selection: {
      selectedChatId,
      selectedChatType,
    },
  };
}
