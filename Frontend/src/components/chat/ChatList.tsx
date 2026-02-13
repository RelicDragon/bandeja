import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import transliterate from '@sindresorhus/transliterate';
import { CityUserCard } from './CityUserCard';
import { ChatListItem } from './ChatListItem';
import { ChatListSearchBar } from './ChatListSearchBar';
import { chatApi, ChatDraft, getLastMessageTime, GroupChannel } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
import { getMarketChatDisplayTitle, getMarketChatDisplayTitleForSellerGrouped, getMarketChatDisplayParts } from '@/utils/marketChatUtils';
import { useGroupChannelUnreadCounts } from '@/hooks/useGroupChannelUnreadCounts';
import {
  deduplicateChats,
  getChatKey,
  calculateLastMessageDate,
  groupsToChatItems,
  channelsToChatItems,
  applyPaginationState,
  createLoadMore,
  type FilterCache
} from '@/utils/chatListHelpers';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useNavigationStore } from '@/store/navigationStore';
import { BasicUser } from '@/types';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { MessageCircle, Package, ShoppingCart, Store } from 'lucide-react';
import { BugModal } from '@/components/bugs/BugModal';
import { MarketItemDrawer } from '@/components/marketplace';
import { marketplaceApi } from '@/api/marketplace';
import { MarketItem } from '@/types';
import { BugsFilterPanel } from '@/components/bugs/BugsFilterPanel';
import { ChatMessageSearchResults } from './ChatMessageSearchResults';
import { CollapsibleSection } from './CollapsibleSection';
import { ChatMessage } from '@/api/chat';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { ChatItem, ChatType } from './chatListTypes';

export type { ChatType };

interface ChatListProps {
  onChatSelect?: (chatId: string, chatType: ChatType, options?: { initialChatType?: string; searchQuery?: string }) => void;
  isDesktop?: boolean;
  selectedChatId?: string | null;
  selectedChatType?: ChatType | null;
}

export const ChatList = ({ onChatSelect, isDesktop = false, selectedChatId, selectedChatType }: ChatListProps) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { chatsFilter, bugsFilter, openBugModal, setOpenBugModal } = useNavigationStore();
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastNewBug = useSocketEventsStore((state) => state.lastNewBug);
  const lastSyncCompletedAt = useChatSyncStore((state) => state.lastSyncCompletedAt);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const urlQuery = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(urlQuery);
  const debouncedSearchQuery = useDebounce(searchInput, 500);
  const skipUrlSyncRef = useRef(false);
  const [contactsMode, setContactsMode] = useState(false);
  const [cityUsers, setCityUsers] = useState<BasicUser[]>([]);
  const [cityUsersLoading, setCityUsersLoading] = useState(false);
  const [searchableUsersData, setSearchableUsersData] = useState<{ activeChats: ChatItem[]; cityUsers: BasicUser[] } | null>(null);
  const [listTransition, setListTransition] = useState<'idle' | 'out' | 'in'>('idle');
  const [bugsHasMore, setBugsHasMore] = useState(false);
  const [bugsLoadingMore, setBugsLoadingMore] = useState(false);
  const bugsPageRef = useRef(1);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const usersPageRef = useRef(1);
  const [channelsHasMore, setChannelsHasMore] = useState(false);
  const [channelsLoadingMore, setChannelsLoadingMore] = useState(false);
  const channelsPageRef = useRef(1);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [marketLoadingMore, setMarketLoadingMore] = useState(false);
  const marketPageRef = useRef(1);
  const marketChatRole = (searchParams.get('role') === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller';
  const itemIdFromUrl = searchParams.get('item');
  const [selectedMarketItemForDrawer, setSelectedMarketItemForDrawer] = useState<MarketItem | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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

  const chatsCacheRef = useRef<Partial<Record<'users' | 'bugs' | 'channels' | 'market', FilterCache>>>({});
  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? chats.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, chats]
  );
  const marketUnreadCounts = useGroupChannelUnreadCounts(marketChannelIds);

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    if (urlQuery !== searchInput) {
      setSearchInput(urlQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync from URL when urlQuery changes
  }, [urlQuery]);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user?.id, fetchFavorites]);

  const fetchUsersSearchData = useCallback(async (): Promise<{ activeChats: ChatItem[]; cityUsers: BasicUser[]; usersHasMore: boolean }> => {
    if (!user) return { activeChats: [], cityUsers: [], usersHasMore: false };
    const { fetchPlayers, fetchUserChats } = usePlayersStore.getState();
    await Promise.all([fetchPlayers(), fetchUserChats()]);
    const draftsResponse = await chatApi.getUserDrafts(1, 100).catch(() => ({ drafts: [] }));
    const allDrafts = draftsResponse.drafts || [];
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
          unreadCount: unreadCounts[chat.id] || 0,
          otherUser,
          draft: draft || null
        });
      }
    });
    try {
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', 1);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = groupIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(groupIds)).data || {}
        : {};
      const groupChatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      activeChats.push(...groupChatItems);
      sortChatItems(activeChats, 'users', user?.id);
      const cityUsersData = await usersApi.getInvitablePlayers().then(r => r.data || []).catch(() => []);
      return { activeChats, cityUsers: cityUsersData, usersHasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersSearchData failed:', err);
      sortChatItems(activeChats, 'users', user?.id);
      const cityUsersData = await usersApi.getInvitablePlayers().then(r => r.data || []).catch(() => []);
      return { activeChats, cityUsers: cityUsersData, usersHasMore: false };
    }
  }, [user]);

  const fetchUsersGroups = useCallback(async (page: number): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const draftsResponse = await chatApi.getUserDrafts(1, 100).catch(() => ({ drafts: [] }));
      const allDrafts = draftsResponse.drafts || [];
      const { data: groups, pagination } = await chatApi.getGroupChannels('users', page);
      const groupList = (groups || []) as GroupChannel[];
      const groupIds = groupList.map((g: GroupChannel) => g.id);
      const groupUnreads = groupIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(groupIds)).data || {}
        : {};
      const chatItems = groupsToChatItems(groupList, groupUnreads, allDrafts, 'users', user?.id);
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchUsersGroups failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user]);

  const fetchBugs = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const bf = useNavigationStore.getState().bugsFilter;
      const filterParams = (bf.status || bf.type || bf.createdByMe)
        ? { status: bf.status, type: bf.type, createdByMe: bf.createdByMe }
        : undefined;
      const { data: channels, pagination } = await chatApi.getGroupChannels('bugs', page, filterParams);
      const channelList = (channels || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', { useUpdatedAtFallback: true, filterByIsGroup: true });
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchBugs failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user]);

  const fetchChannels = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const { data: channels, pagination } = await chatApi.getGroupChannels('channels', page);
      const channelList = (channels || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'channels', { filterByIsChannel: true });
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchChannels failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user]);

  const fetchMarket = useCallback(async (page = 1): Promise<{ chats: ChatItem[]; hasMore: boolean }> => {
    if (!user) return { chats: [], hasMore: false };
    try {
      const { data: channels, pagination } = await chatApi.getGroupChannels('market', page);
      const channelList = (channels || []) as GroupChannel[];
      const channelIds = channelList.map((c: GroupChannel) => c.id);
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'market', { filterByIsGroup: true, useUpdatedAtFallback: true });
      return { chats: chatItems, hasMore: pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchMarket failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user]);

  const fetchAllFilters = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const bf = useNavigationStore.getState().bugsFilter;
      const bugsFilterParams = (bf.status || bf.type || bf.createdByMe)
        ? { status: bf.status, type: bf.type, createdByMe: bf.createdByMe }
        : undefined;

      const [
        usersGroupsRes,
        bugsRes,
        channelsRes,
        marketRes,
        _p,
        draftsResponse
      ] = await Promise.all([
        chatApi.getGroupChannels('users', 1),
        chatApi.getGroupChannels('bugs', 1, bugsFilterParams),
        chatApi.getGroupChannels('channels', 1),
        chatApi.getGroupChannels('market', 1),
        Promise.all([usePlayersStore.getState().fetchPlayers(), usePlayersStore.getState().fetchUserChats()]),
        chatApi.getUserDrafts(1, 100).catch(() => ({ drafts: [] }))
      ]);

      const allGroupIds = [
        ...(usersGroupsRes.data || []).map((g: GroupChannel) => g.id),
        ...(bugsRes.data || []).map((c: GroupChannel) => c.id),
        ...(channelsRes.data || []).map((c: GroupChannel) => c.id),
        ...(marketRes.data || []).map((c: GroupChannel) => c.id)
      ];
      const uniqueGroupIds = Array.from(new Set(allGroupIds));
      const groupUnreads =
        uniqueGroupIds.length > 0
          ? (await chatApi.getGroupChannelsUnreadCounts(uniqueGroupIds)).data || {}
          : {};

      const allDrafts = draftsResponse.drafts || [];
      const usersGroupList = (usersGroupsRes.data || []) as GroupChannel[];
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
            unreadCount: unreadCounts[chat.id] || 0,
            otherUser,
            draft: draft || null
          });
        }
      });
      const usersGroupItems = groupsToChatItems(usersGroupList, groupUnreads, allDrafts, 'users', user?.id);
      activeChats.push(...usersGroupItems);
      sortChatItems(activeChats, 'users', user?.id);

      const cityUsersData = await usersApi.getInvitablePlayers().then(r => r.data || []).catch(() => []);
      const usersChatItems = deduplicateChats(activeChats);
      const bugsChatItems = channelsToChatItems(
        (bugsRes.data || []) as GroupChannel[],
        groupUnreads,
        'bugs',
        { useUpdatedAtFallback: true, filterByIsGroup: true }
      );
      const channelsChatItems = channelsToChatItems(
        (channelsRes.data || []) as GroupChannel[],
        groupUnreads,
        'channels',
        { filterByIsChannel: true }
      );
      const marketChatItems = channelsToChatItems(
        (marketRes.data || []) as GroupChannel[],
        groupUnreads,
        'market',
        { filterByIsGroup: true, useUpdatedAtFallback: true }
      );

      chatsCacheRef.current.users = {
        chats: usersChatItems,
        cityUsers: cityUsersData,
        usersHasMore: usersGroupsRes.pagination?.hasMore ?? false
      };
      chatsCacheRef.current.bugs = { chats: deduplicateChats(bugsChatItems), bugsHasMore: bugsRes.pagination?.hasMore ?? false };
      chatsCacheRef.current.channels = { chats: deduplicateChats(channelsChatItems), channelsHasMore: channelsRes.pagination?.hasMore ?? false };
      chatsCacheRef.current.market = { chats: deduplicateChats(marketChatItems), marketHasMore: marketRes.pagination?.hasMore ?? false };

      const activeFilter = useNavigationStore.getState().chatsFilter;
      if (activeFilter === 'users' || activeFilter === 'bugs' || activeFilter === 'channels' || activeFilter === 'market') {
        const cached = chatsCacheRef.current[activeFilter];
        if (cached) {
          setChats(deduplicateChats(cached.chats));
          if (cached.cityUsers) {
            setCityUsers(cached.cityUsers);
            setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
          }
          applyPaginationState(activeFilter, cached, {
            setBugsHasMore,
            setUsersHasMore,
            setChannelsHasMore,
            setMarketHasMore,
            bugsPageRef,
            usersPageRef,
            channelsPageRef,
            marketPageRef
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchChatsForFilter = useCallback(async (_filter?: 'users' | 'bugs' | 'channels' | 'market') => {
    await fetchAllFilters();
  }, [fetchAllFilters]);

  const paginationSetters = useMemo(
    () => ({
      setBugsHasMore,
      setUsersHasMore,
      setChannelsHasMore,
      setMarketHasMore,
      bugsPageRef,
      usersPageRef,
      channelsPageRef,
      marketPageRef
    }),
    []
  );

  useEffect(() => {
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') return;
    const cached = chatsCacheRef.current[chatsFilter];
    if (cached) {
      setChats(deduplicateChats(cached.chats));
      if (cached.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
      }
      applyPaginationState(chatsFilter, cached, paginationSetters);
      setLoading(false);
      return;
    }
    fetchAllFilters();
  }, [fetchAllFilters, chatsFilter, paginationSetters]);

  const prevBugsFilterRef = useRef(bugsFilter);
  useEffect(() => {
    if (chatsFilter !== 'bugs') return;
    if (prevBugsFilterRef.current === bugsFilter) return;
    prevBugsFilterRef.current = bugsFilter;
    chatsCacheRef.current.bugs = undefined;
    let cancelled = false;
    fetchBugs(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      chatsCacheRef.current.bugs = { chats: deduped, bugsHasMore: hasMore };
      setChats(deduped);
      setBugsHasMore(hasMore);
      bugsPageRef.current = 1;
    }).catch(() => {
      if (!cancelled) setChats([]);
    });
    return () => { cancelled = true; };
  }, [chatsFilter, bugsFilter, fetchBugs]);

  const loadMoreBugs = useCallback(async () => {
    const fn = createLoadMore({
      isActive: chatsFilter === 'bugs',
      loadingMore: bugsLoadingMore,
      hasMore: bugsHasMore,
      pageRef: bugsPageRef,
      fetcher: fetchBugs,
      setChats,
      setLoadingMore: setBugsLoadingMore,
      setHasMore: setBugsHasMore,
      cacheKey: 'bugs',
      cacheRef: chatsCacheRef,
      deduplicate: deduplicateChats
    });
    await fn();
  }, [chatsFilter, bugsLoadingMore, bugsHasMore, fetchBugs]);

  const loadMoreUsers = useCallback(async () => {
    const fn = createLoadMore({
      isActive: chatsFilter === 'users',
      loadingMore: usersLoadingMore,
      hasMore: usersHasMore,
      pageRef: usersPageRef,
      fetcher: fetchUsersGroups,
      setChats,
      setLoadingMore: setUsersLoadingMore,
      setHasMore: setUsersHasMore,
      cacheKey: 'users',
      cacheRef: chatsCacheRef,
      deduplicate: deduplicateChats
    });
    await fn();
  }, [chatsFilter, usersLoadingMore, usersHasMore, fetchUsersGroups]);

  const loadMoreChannels = useCallback(async () => {
    const fn = createLoadMore({
      isActive: chatsFilter === 'channels',
      loadingMore: channelsLoadingMore,
      hasMore: channelsHasMore,
      pageRef: channelsPageRef,
      fetcher: fetchChannels,
      setChats,
      setLoadingMore: setChannelsLoadingMore,
      setHasMore: setChannelsHasMore,
      cacheKey: 'channels',
      cacheRef: chatsCacheRef,
      deduplicate: deduplicateChats
    });
    await fn();
  }, [chatsFilter, channelsLoadingMore, channelsHasMore, fetchChannels]);

  const loadMoreMarket = useCallback(async () => {
    const fn = createLoadMore({
      isActive: chatsFilter === 'market',
      loadingMore: marketLoadingMore,
      hasMore: marketHasMore,
      pageRef: marketPageRef,
      fetcher: fetchMarket,
      setChats,
      setLoadingMore: setMarketLoadingMore,
      setHasMore: setMarketHasMore,
      cacheKey: 'market',
      cacheRef: chatsCacheRef,
      deduplicate: deduplicateChats
    });
    await fn();
  }, [chatsFilter, marketLoadingMore, marketHasMore, fetchMarket]);

  const shouldLoadMore = (chatsFilter === 'bugs' && bugsHasMore && !bugsLoadingMore) ||
    (chatsFilter === 'users' && usersHasMore && !usersLoadingMore) ||
    (chatsFilter === 'channels' && channelsHasMore && !channelsLoadingMore) ||
    (chatsFilter === 'market' && marketHasMore && !marketLoadingMore);
  const loadMore = chatsFilter === 'bugs' ? loadMoreBugs : chatsFilter === 'users' ? loadMoreUsers : chatsFilter === 'market' ? loadMoreMarket : loadMoreChannels;

  useEffect(() => {
    if (!shouldLoadMore) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: null, rootMargin: '100px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [chatsFilter, shouldLoadMore, loadMore]);

  useEffect(() => {
    const data = lastChatUnreadCount;
    if (!data || data.contextType !== 'GROUP') return;
    if (marketChannelIds.includes(data.contextId)) return;
    let cancelled = false;
    fetchMarket(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      chatsCacheRef.current.market = { chats: deduped, marketHasMore: hasMore };
      if (chatsFilter === 'market') {
        setChats(deduped);
        setMarketHasMore(hasMore);
        marketPageRef.current = 1;
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lastChatUnreadCount, marketChannelIds, chatsFilter, fetchMarket]);

  const fetchCityUsers = useCallback(async () => {
    if (!user?.currentCity?.id) return;
    setCityUsersLoading(true);
    try {
      const response = await usersApi.getInvitablePlayers();
      setCityUsers(response.data || []);
    } catch {
      setCityUsers([]);
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
        fetchCityUsers();
        setListTransition('in');
        setTimeout(() => setListTransition('idle'), 300);
      }, 250);
    }
  }, [contactsMode, fetchCityUsers, setSearchParams]);

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
    const cached = chatsCacheRef.current.users?.cityUsers;
    if (cached?.length) return;
    fetchCityUsers();
  }, [chatsFilter, debouncedSearchQuery, contactsMode, fetchCityUsers]);

  useEffect(() => {
    if (chatsFilter === 'bugs') setSearchableUsersData(null);
    else if (chatsFilter === 'channels' && debouncedSearchQuery.trim().length >= 2 && !searchableUsersData) {
      fetchUsersSearchData().then((data) => setSearchableUsersData(data)).catch(() => setSearchableUsersData(null));
    }
  }, [chatsFilter, debouncedSearchQuery, searchableUsersData, fetchUsersSearchData]);

  const updateChatDraft = useCallback((
    prevChats: ChatItem[],
    chatContextType: string,
    contextId: string,
    draft: ChatDraft | null
  ): ChatItem[] => {
    const updatedChats = prevChats.map((chat) => {
      if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
        const lastMessageDate = (chat.data.lastMessage || draft)
          ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
          : null;
        return {
          ...chat,
          draft,
          lastMessageDate
        };
      } else if (chat.type === 'group' && chatContextType === 'GROUP' && chat.data.id === contextId) {
        const lastMessageDate = (chat.data.lastMessage || draft)
          ? calculateLastMessageDate(chat.data.lastMessage, draft, chat.data.updatedAt)
          : null;
        return {
          ...chat,
          draft,
          lastMessageDate
        };
      }
      return chat;
    });

    if (chatsFilter === 'users') {
      return sortChatItems(updatedChats, 'users', user?.id);
    }

    return updatedChats;
  }, [chatsFilter, user?.id]);

  const updateChatMessage = useCallback((
    prevChats: ChatItem[],
    chatContextType: string,
    contextId: string,
    message: ChatMessage
  ): ChatItem[] => {
    const { chats: storeChats, unreadCounts } = usePlayersStore.getState();
    const updatedChats = prevChats.map((chat) => {
      if (chat.type === 'user' && chatContextType === 'USER' && chat.data.id === contextId) {
        const updatedChat = storeChats[contextId] || chat.data;
        const draft = chat.draft || null;
        const lastMessageDate = ((updatedChat.lastMessage || message) || draft)
          ? calculateLastMessageDate(updatedChat.lastMessage || message, draft, updatedChat.updatedAt)
          : null;
        return {
          ...chat,
          data: updatedChat,
          unreadCount: unreadCounts[contextId] || chat.unreadCount || 0,
          lastMessageDate
        };
      } else if ((chat.type === 'group' || chat.type === 'channel') && chatContextType === 'GROUP' && chat.data.id === contextId) {
        const draft = chat.type === 'group' ? (chat.draft || null) : null;
        const lastMessageDate = (message || draft)
          ? calculateLastMessageDate(message, draft, new Date().toISOString())
          : null;
        return {
          ...chat,
          data: {
            ...chat.data,
            lastMessage: message,
            updatedAt: new Date().toISOString()
          },
          lastMessageDate
        };
      }
      return chat;
    });

    if (chatsFilter === 'users') {
      return sortChatItems(updatedChats, 'users', user?.id);
    }
    if (chatsFilter === 'bugs' || chatsFilter === 'channels') {
      return sortChatItems(updatedChats, chatsFilter);
    }

    return updatedChats;
  }, [chatsFilter, user?.id]);

  useEffect(() => {
    const handleRefresh = () => {
      if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
        fetchChatsForFilter(chatsFilter);
      }
    };

    const handleDraftUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{
        draft: ChatDraft;
        chatContextType: string;
        contextId: string;
      }>;
      const { draft, chatContextType, contextId } = customEvent.detail;

      setChats((prevChats) => deduplicateChats(updateChatDraft(prevChats, chatContextType, contextId, draft)));
    };

    const handleDraftDelete = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chatContextType: string;
        contextId: string;
      }>;
      const { chatContextType, contextId } = customEvent.detail;

      setChats((prevChats) => deduplicateChats(updateChatDraft(prevChats, chatContextType, contextId, null)));
    };

    const handleViewingClearUnread = (event: Event) => {
      const customEvent = event as CustomEvent<{ contextType: string; contextId: string }>;
      const { contextId } = customEvent.detail;
      setChats((prev) =>
        prev.map((chat) =>
          (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId ? { ...chat, unreadCount: 0 } : chat
        )
      );
    };

    window.addEventListener('refresh-chat-list', handleRefresh);
    window.addEventListener('draft-updated', handleDraftUpdate);
    window.addEventListener('draft-deleted', handleDraftDelete);
    window.addEventListener('chat-viewing-clear-unread', handleViewingClearUnread);

    return () => {
      window.removeEventListener('refresh-chat-list', handleRefresh);
      window.removeEventListener('draft-updated', handleDraftUpdate);
      window.removeEventListener('draft-deleted', handleDraftDelete);
      window.removeEventListener('chat-viewing-clear-unread', handleViewingClearUnread);
    };
  }, [fetchChatsForFilter, chatsFilter, updateChatDraft, updateChatMessage]);

  useEffect(() => {
    if (!lastChatMessage) return;

    const handleNewMessage = (data: { contextType: string; contextId: string; message: any }) => {
      const { contextType, contextId, message } = data;

      const shouldUpdate =
        (chatsFilter === 'users' && (contextType === 'USER' || contextType === 'GROUP')) ||
        (chatsFilter === 'bugs' && contextType === 'GROUP') ||
        (chatsFilter === 'channels' && contextType === 'GROUP') ||
        (chatsFilter === 'market' && contextType === 'GROUP');

      if (shouldUpdate) {
        const isViewingThis =
          isDesktop &&
          selectedChatId === contextId &&
          ((contextType === 'USER' && selectedChatType === 'user') ||
            (contextType === 'GROUP' && (selectedChatType === 'group' || selectedChatType === 'channel')));
        if (isViewingThis && contextType === 'USER') {
          usePlayersStore.getState().markChatAsRead(contextId);
        }
        setChats((prevChats) => {
          const chatExists = prevChats.some((chat) => {
            if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
            if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) {
              if (chatsFilter === 'channels') return chat.type === 'channel';
              if (chatsFilter === 'users') return chat.type === 'group';
              if (chatsFilter === 'bugs') return chat.type === 'channel' && chat.data.bug;
              if (chatsFilter === 'market') return chat.type === 'channel' && chat.data.marketItemId;
              return true;
            }
            return false;
          });

          if (chatExists) {
            let next = deduplicateChats(updateChatMessage(prevChats, contextType, contextId, message));
            if (isViewingThis) {
              next = next.map((chat) => {
                if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return { ...chat, unreadCount: 0 };
                if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) return { ...chat, unreadCount: 0 };
                return chat;
              });
            }
            return next;
          }

          return prevChats;
        });
      }
    };

    handleNewMessage(lastChatMessage);
  }, [lastChatMessage, chatsFilter, updateChatMessage, isDesktop, selectedChatId, selectedChatType]);

  useEffect(() => {
    if (!lastChatUnreadCount || lastChatUnreadCount.contextType !== 'GROUP') return;
    const { contextId, unreadCount } = lastChatUnreadCount;
    const isViewingThis = isDesktop && selectedChatId === contextId && (selectedChatType === 'group' || selectedChatType === 'channel');
    setChats((prev) =>
      prev.map((chat) =>
        (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId
          ? { ...chat, unreadCount: isViewingThis ? 0 : unreadCount }
          : chat
      )
    );
  }, [lastChatUnreadCount, isDesktop, selectedChatId, selectedChatType]);

  useEffect(() => {
    if (lastSyncCompletedAt == null) return;
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') {
      fetchChatsForFilter(chatsFilter);
    }
  }, [lastSyncCompletedAt, chatsFilter, fetchChatsForFilter]);

  useEffect(() => {
    if (!lastNewBug || chatsFilter !== 'bugs') return;
    let cancelled = false;
    fetchBugs(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      chatsCacheRef.current.bugs = { chats: deduped, bugsHasMore: hasMore };
      setChats(deduped);
      setBugsHasMore(hasMore);
      bugsPageRef.current = 1;
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lastNewBug, chatsFilter, fetchBugs]);

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

  const handleChatClick = useCallback((chatId: string, chatType: ChatType, options?: { initialChatType?: string; searchQuery?: string }) => {
    onChatSelect?.(chatId, chatType, options);
  }, [onChatSelect]);

  const handleCreateListing = useCallback(() => {
    navigate('/marketplace/create');
  }, [navigate]);

  const normalizeString = (str: string) => {
    return transliterate(str).toLowerCase();
  };

  const activeChats = useMemo(() => {
    return chats.filter((c) => c.type === 'user' || c.type === 'group') as ChatItem[];
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

    try {
      const response = await chatApi.getOrCreateChatWithUser(userId);
      const chat = response.data;

      const { addChat } = usePlayersStore.getState();
      await addChat(chat);

      const updatedUnreadCounts = usePlayersStore.getState().unreadCounts;
      const otherUser = chat.user1Id === user.id ? chat.user2 : chat.user1;

      if (chatsFilter === 'users' && otherUser) {
        setChats((prevChats) => {
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

      onChatSelect?.(chat.id, 'user', isSearchMode ? { searchQuery: debouncedSearchQuery.trim() } : undefined);
    } catch (error) {
      console.error('Failed to create/get chat with user:', error);
    }
  }, [user, chatsFilter, onChatSelect, isSearchMode, debouncedSearchQuery]);

  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [gamesExpanded, setGamesExpanded] = useState(true);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [bugsExpanded, setBugsExpanded] = useState(true);
  const [marketListingsExpanded, setMarketListingsExpanded] = useState(true);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugsFilterPanelOpen, setBugsFilterPanelOpen] = useState(false);
  const [unreadFilterActive, setUnreadFilterActive] = useState(false);

  const marketBuyerSellerUnread = useMemo(() => {
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

  const unreadChatsCount = useMemo(() => {
    if (chatsFilter === 'market') {
      return marketFilteredByRoleAndSearch.reduce(
        (sum, c) => sum + ('unreadCount' in c ? (c.unreadCount ?? 0) : 0),
        0
      );
    }
    return chats
      .filter((c) => c.type === 'user' || c.type === 'group' || c.type === 'channel')
      .reduce((sum, c) => sum + ('unreadCount' in c ? (c.unreadCount ?? 0) : 0), 0);
  }, [chatsFilter, chats, marketFilteredByRoleAndSearch]);
  const hasUnreadChats = unreadChatsCount > 0;

  useEffect(() => {
    if (!hasUnreadChats) setUnreadFilterActive(false);
  }, [hasUnreadChats]);

  const displayedChats = useMemo(() => {
    if (chatsFilter === 'market') {
      if (!unreadFilterActive) return marketFilteredByRoleAndSearch;
      return marketFilteredByRoleAndSearch.filter((c) => ('unreadCount' in c ? (c.unreadCount ?? 0) : 0) > 0);
    }
    if (!unreadFilterActive) return chats;
    return chats.filter((c) => (c.type === 'user' || c.type === 'group' || c.type === 'channel') && (c.unreadCount ?? 0) > 0);
  }, [chatsFilter, chats, unreadFilterActive, marketFilteredByRoleAndSearch]);

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

  const searchSections = useMemo(() => {
    const active: Array<{ type: 'chat'; data: ChatItem }> = [];
    const users: Array<{ type: 'contact'; user: BasicUser }> = [];
    let current: 'active' | 'users' | null = null;
    for (const item of displayChats) {
      if (item.type === 'section') current = item.label;
      else if (current === 'active' && item.type === 'chat') active.push(item);
      else if (current === 'users' && item.type === 'contact') users.push(item);
    }
    return { active, users };
  }, [displayChats]);

  const renderActiveSection = () =>
    searchSections.active.length > 0 ? (
      <CollapsibleSection
        title={t('chat.activeChats', { defaultValue: 'Active chats' })}
        expanded={activeChatsExpanded}
        onToggle={() => setActiveChatsExpanded((e) => !e)}
      >
        {searchSections.active.map((item) => (
          <ChatListItem
            key={getChatKey(item.data)}
            item={item.data}
            selectedChatId={selectedChatId}
            selectedChatType={selectedChatType}
            onChatClick={handleChatClick}
            onContactClick={handleContactClick}
            isSearchMode={isSearchMode}
            searchQuery={debouncedSearchQuery.trim()}
          />
        ))}
      </CollapsibleSection>
    ) : null;

  const renderUsersSection = () =>
    searchSections.users.length > 0 ? (
      <CollapsibleSection
        title={t('chat.users', { defaultValue: 'Users' })}
        expanded={usersExpanded}
        onToggle={() => setUsersExpanded((e) => !e)}
      >
        {searchSections.users.map((item) => (
          <CityUserCard
            key={`contact-${item.user.id}`}
            user={item.user}
            onClick={() => handleContactClick(item.user.id)}
          />
        ))}
      </CollapsibleSection>
    ) : null;

  if (loading) {
    return (
      <>
        {!isDesktop && (
          <RefreshIndicator
            isRefreshing={isRefreshing}
            pullDistance={pullDistance}
            pullProgress={pullProgress}
          />
        )}
        <div
          className={isDesktop ? '' : 'space-y-0'}
          style={{
            transform: isDesktop ? 'none' : `translateY(${pullDistance}px)`,
            transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const showContactsEmpty = contactsMode && chatsFilter === 'users' && !isSearchMode && !cityUsersLoading && cityUsers.length === 0;
  const showChatsEmpty = !contactsMode && !isSearchMode && (chatsFilter === 'market' ? displayedChats.length === 0 : chats.length === 0) && !loading;

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-gray-500 dark:text-gray-400">
      {chatsFilter === 'market' ? (
        <Package size={64} className="mb-4 opacity-50" />
      ) : (
        <MessageCircle size={64} className="mb-4 opacity-50" />
      )}
      <p className="text-lg font-medium">
        {showContactsEmpty && (user?.currentCity ? t('chat.noCityUsers', { defaultValue: 'No users in your city' }) : t('chat.noCitySet', { defaultValue: 'Set your city to see players' }))}
        {showChatsEmpty && chatsFilter !== 'market' && t('chat.noConversations', { defaultValue: 'No conversations yet' })}
      </p>
      <p className="text-sm mt-2">
        {showContactsEmpty && user?.currentCity && t('chat.noCityUsersHint', { defaultValue: 'Try a different search' })}
        {showChatsEmpty && chatsFilter === 'users' && t('chat.noUserChats', { defaultValue: 'Start chatting with players' })}
        {showChatsEmpty && chatsFilter === 'bugs' && t('chat.noBugChats', { defaultValue: 'No bug reports yet' })}
        {showChatsEmpty && chatsFilter === 'channels' && t('chat.noChannels', { defaultValue: 'No channels yet' })}
        {showChatsEmpty && chatsFilter === 'market' && debouncedSearchQuery.trim() && t('marketplace.noSearchResultsMarketChats', { defaultValue: 'No results for this search' })}
        {showChatsEmpty && chatsFilter === 'market' && !debouncedSearchQuery.trim() && marketChatRole === 'buyer' && t('marketplace.noBuyerChats', { defaultValue: 'No chats as buyer' })}
        {showChatsEmpty && chatsFilter === 'market' && !debouncedSearchQuery.trim() && marketChatRole === 'seller' && t('marketplace.noSellerChats', { defaultValue: 'No chats as seller' })}
      </p>
    </div>
  );

  return (
    <>
      {!isDesktop && (
        <RefreshIndicator
          isRefreshing={isRefreshing}
          pullDistance={pullDistance}
          pullProgress={pullProgress}
        />
      )}
      <div
        className={isDesktop ? 'h-full bg-white dark:bg-gray-900 flex flex-col min-h-0 overflow-hidden pb-20' : ''}
        style={{
          transform: isDesktop ? 'none' : `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {(chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels' || chatsFilter === 'market') && (
          <ChatListSearchBar
            chatsFilter={chatsFilter}
            contactsMode={contactsMode}
            searchInput={searchInput}
            hasUnreadChats={hasUnreadChats}
            unreadChatsCount={unreadChatsCount}
            unreadFilterActive={unreadFilterActive}
            onUnreadFilterToggle={() => setUnreadFilterActive((a) => !a)}
            onSearchChange={(v) => {
              skipUrlSyncRef.current = true;
              setSearchInput(v);
              setSearchParams((p) => {
                const next = new URLSearchParams(p);
                if (v.trim()) next.set('q', v);
                else next.delete('q');
                return next;
              }, { replace: true });
            }}
            onClearSearch={() => {
              skipUrlSyncRef.current = true;
              setSearchInput('');
              setSearchParams((p) => {
                const next = new URLSearchParams(p);
                next.delete('q');
                return next;
              }, { replace: true });
            }}
            onContactsToggle={handleContactsToggle}
            onAddBug={() => setShowBugModal(true)}
            onCreateListing={chatsFilter === 'market' ? handleCreateListing : undefined}
            isDesktop={isDesktop}
            hasCity={!!user?.currentCity?.id}
            bugsFilterPanelOpen={bugsFilterPanelOpen}
            onBugsFilterToggle={() => setBugsFilterPanelOpen((o) => !o)}
          />
        )}
        <AnimatePresence>
          {chatsFilter === 'bugs' && bugsFilterPanelOpen && (
            <motion.div
              key="bugs-filter"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <BugsFilterPanel />
            </motion.div>
          )}
        </AnimatePresence>
        {chatsFilter === 'market' && (
          <div className="flex items-center justify-center mt-2 mb-2">
            <SegmentedSwitch
              tabs={[
                { id: 'buyer', label: t('marketplace.imBuyer', { defaultValue: "I'm buyer" }), icon: ShoppingCart, badge: marketBuyerSellerUnread.buyer },
                { id: 'seller', label: t('marketplace.imSeller', { defaultValue: "I'm seller" }), icon: Store, badge: marketBuyerSellerUnread.seller },
              ]}
              activeId={marketChatRole}
              onChange={(id) => setMarketChatRole(id as 'buyer' | 'seller')}
              titleInActiveOnly={false}
              layoutId="marketRoleSubtab"
              className="mx-2"
            />
          </div>
        )}
        <div
          className="flex-1 min-h-0 overflow-y-auto scrollbar-auto"
          style={{
            opacity: listTransition === 'out' ? 0 : 1,
            transform: listTransition === 'out' ? 'scale(0.98)' : 'scale(1)',
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
        >
          {!isSearchMode && contactsMode && cityUsersLoading ? (
            <div className="p-4 flex justify-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isSearchMode ? (
            (displayChats.length === 0 && debouncedSearchQuery.trim().length < 2) ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <p className="font-medium">{t('chat.noSearchResults', { defaultValue: 'No results' })}</p>
                <p className="text-sm mt-1">{t('chat.tryDifferentSearch', { defaultValue: 'Try a different search' })}</p>
              </div>
            ) : (
            <>
            {debouncedSearchQuery.trim().length >= 2 && (
              <>
                {chatsFilter === 'channels' ? (
                  <ChatMessageSearchResults
                    query={debouncedSearchQuery}
                    chatsFilter={chatsFilter}
                    insertBetween={
                      <>
                        {renderActiveSection()}
                        {renderUsersSection()}
                      </>
                    }
                    onResultClick={(chatId, chatType, options) => handleChatClick(chatId, chatType, { ...options, ...(debouncedSearchQuery.trim() ? { searchQuery: debouncedSearchQuery.trim() } : {}) })}
                    messagesExpanded={messagesExpanded}
                    gamesExpanded={gamesExpanded}
                    channelsExpanded={channelsExpanded}
                    bugsExpanded={bugsExpanded}
                    marketListingsExpanded={marketListingsExpanded}
                    onMessagesToggle={() => setMessagesExpanded((e) => !e)}
                    onGamesToggle={() => setGamesExpanded((e) => !e)}
                    onChannelsToggle={() => setChannelsExpanded((e) => !e)}
                    onBugsToggle={() => setBugsExpanded((e) => !e)}
                    onMarketListingsToggle={() => setMarketListingsExpanded((e) => !e)}
                  />
                ) : chatsFilter === 'market' ? (
                  <ChatMessageSearchResults
                    query={debouncedSearchQuery}
                    chatsFilter={chatsFilter}
                    onResultClick={(chatId, chatType, options) => handleChatClick(chatId, chatType, { ...options, ...(debouncedSearchQuery.trim() ? { searchQuery: debouncedSearchQuery.trim() } : {}) })}
                    messagesExpanded={messagesExpanded}
                    gamesExpanded={gamesExpanded}
                    channelsExpanded={channelsExpanded}
                    bugsExpanded={bugsExpanded}
                    marketListingsExpanded={marketListingsExpanded}
                    onMessagesToggle={() => setMessagesExpanded((e) => !e)}
                    onGamesToggle={() => setGamesExpanded((e) => !e)}
                    onChannelsToggle={() => setChannelsExpanded((e) => !e)}
                    onBugsToggle={() => setBugsExpanded((e) => !e)}
                    onMarketListingsToggle={() => setMarketListingsExpanded((e) => !e)}
                  />
                ) : (
                  <>
                    {contactsMode ? (
                      <>
                        {renderUsersSection()}
                        {renderActiveSection()}
                      </>
                    ) : (
                      <>
                        {renderActiveSection()}
                        {renderUsersSection()}
                      </>
                    )}
                    <ChatMessageSearchResults
                      query={debouncedSearchQuery}
                      chatsFilter={chatsFilter}
                      onResultClick={(chatId, chatType, options) => handleChatClick(chatId, chatType, { ...options, ...(debouncedSearchQuery.trim() ? { searchQuery: debouncedSearchQuery.trim() } : {}) })}
                      messagesExpanded={messagesExpanded}
                      gamesExpanded={gamesExpanded}
                      channelsExpanded={channelsExpanded}
                      bugsExpanded={bugsExpanded}
                      marketListingsExpanded={marketListingsExpanded}
                      onMessagesToggle={() => setMessagesExpanded((e) => !e)}
                      onGamesToggle={() => setGamesExpanded((e) => !e)}
                      onChannelsToggle={() => setChannelsExpanded((e) => !e)}
                      onBugsToggle={() => setBugsExpanded((e) => !e)}
                      onMarketListingsToggle={() => setMarketListingsExpanded((e) => !e)}
                    />
                  </>
                )}
              </>
            )}
            </>
            )
          ) : contactsMode ? (
            showContactsEmpty ? (
              renderEmptyState()
            ) : (
            <>
              <div className="px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                {t('chat.users', { defaultValue: 'Users' })}
              </div>
              {cityUsers.map((cityUser) => (
                <CityUserCard
                  key={cityUser.id}
                  user={cityUser}
                  onClick={() => handleContactClick(cityUser.id)}
                />
              ))}
            </>
            )
          ) : showChatsEmpty ? (
            renderEmptyState()
          ) : (
            <>
              {chatsFilter === 'market' && marketGroupedByItem ? (
                marketGroupedByItem.map((group) => (
                  <div key={group.itemId} className="mx-2 mb-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleMarketItemGroupClick(group)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMarketItemGroupClick(group)}
                      className="rounded-t-xl px-3 py-2.5 bg-gray-100 dark:bg-gray-800 border-l-4 border-primary-500 dark:border-primary-400 flex items-center gap-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/80 active:bg-gray-300 dark:active:bg-gray-700 transition-colors"
                    >
                      {group.thumb ? (
                        <img src={group.thumb} alt="" className="w-8 h-8 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <Package className="w-4 h-4 text-primary-600" />
                        </div>
                      )}
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{group.title || t('marketplace.listing', { defaultValue: 'Listing' })}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                        {t('marketplace.chatCount', { count: group.channels.length })}
                      </span>
                    </div>
                    <div className="rounded-b-xl bg-gray-50/80 dark:bg-gray-900/40 border-l-4 border-primary-200 dark:border-primary-800/60">
                      {group.channels.map((chat) => (
                      <ChatListItem
                        key={getChatKey(chat)}
                        item={chat}
                        selectedChatId={selectedChatId}
                        selectedChatType={selectedChatType}
                        onChatClick={handleChatClick}
                        onContactClick={handleContactClick}
                        isSearchMode={isSearchMode}
                        searchQuery={debouncedSearchQuery.trim()}
                        displayTitle={getMarketChatDisplayTitleForSellerGrouped((chat as Extract<typeof chat, { type: 'channel' }>).data)}
                        sellerGroupedByItem
                      />
                    ))}
                    </div>
                  </div>
                ))
              ) : (
                displayedChats.map((chat) => (
                  <ChatListItem
                    key={getChatKey(chat)}
                    item={chat}
                    selectedChatId={selectedChatId}
                    selectedChatType={selectedChatType}
                    onChatClick={handleChatClick}
                    onContactClick={handleContactClick}
                    isSearchMode={isSearchMode}
                    searchQuery={debouncedSearchQuery.trim()}
                    displayTitle={chatsFilter === 'market' && chat.type === 'channel' && user?.id ? (marketChatRole === 'buyer' ? getMarketChatDisplayParts(chat.data, user.id, 'buyer').title : getMarketChatDisplayTitle(chat.data, marketChatRole)) : undefined}
                    displaySubtitle={chatsFilter === 'market' && chat.type === 'channel' && user?.id && marketChatRole === 'buyer' ? getMarketChatDisplayParts(chat.data, user.id, 'buyer').subtitle : undefined}
                  />
                ))
              )}
              {((chatsFilter === 'bugs' && bugsHasMore) || (chatsFilter === 'users' && usersHasMore) || (chatsFilter === 'channels' && channelsHasMore) || (chatsFilter === 'market' && marketHasMore)) && (
                <div ref={loadMoreSentinelRef} className="py-4 flex justify-center">
                  {(bugsLoadingMore || usersLoadingMore || channelsLoadingMore || marketLoadingMore) && (
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {chatsFilter === 'bugs' && (
        <BugModal
          isOpen={showBugModal}
          onClose={() => setShowBugModal(false)}
          onSuccess={handleBugCreated}
        />
      )}
      {selectedMarketItemForDrawer && (
        <MarketItemDrawer
          item={selectedMarketItemForDrawer}
          isOpen={!!selectedMarketItemForDrawer}
          onClose={closeMarketItemDrawer}
        />
      )}
    </>
  );
};
