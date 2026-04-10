import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import transliterate from '@sindresorhus/transliterate';
import { chatApi, ChatDraft, getLastMessageTime, GroupChannel } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
import { getMarketChatDisplayTitle } from '@/utils/marketChatUtils';
import { useGroupChannelUnreadCounts } from '@/hooks/useGroupChannelUnreadCounts';
import {
  deduplicateChats,
  getChatKey,
  calculateLastMessageDate,
  groupsToChatItems,
  channelsToChatItems,
  applyPaginationState,
  createLoadMore,
  mergeChatListOutboxFromDexieSlice,
  mergeChatListFromThreadIndexDexie,
  threadIndexLiveMergeSig,
  type FilterCache
} from '@/utils/chatListHelpers';
import { usersApi } from '@/api/users';
import { favoritesApi } from '@/api/favorites';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { usePlayersStore } from '@/store/playersStore';
import { useFavoritesStore } from '@/store/favoritesStore';
import { useNavigationStore } from '@/store/navigationStore';
import { BasicUser } from '@/types';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { marketplaceApi } from '@/api/marketplace';
import { MarketItem } from '@/types';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { useChatSyncStore } from '@/store/chatSyncStore';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { ChatItem, type ChatListProps, type ChatType } from './chatListTypes';
import { UserChat } from '@/api/chat';
import { draftStorage, mergeServerAndLocalDrafts } from '@/services/draftStorage';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { MAX_PINNED_CHATS } from '@/utils/chatListConstants';
import {
  loadThreadIndexForList,
  persistThreadIndexReplace,
  persistThreadIndexUpsert,
} from '@/services/chat/chatThreadIndex';
import { prefetchTopChatsSync } from '@/services/chat/chatPrefetch';
import {
  chatListModuleCache,
  clearChatListModuleCacheWhenUserMismatch,
  type ChatsFilterType,
} from '@/components/chat/chatListModuleCache';
import { useChatListSocketEffects } from './useChatListSocketEffects';
import { useChatListThreadIndexLive } from '@/components/chat/useChatListThreadIndexLive';

export function useChatListModel({
  onChatSelect,
  isDesktop = false,
  selectedChatId,
  selectedChatType,
}: ChatListProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { chatsFilter, bugsFilter, openBugModal, setOpenBugModal } = useNavigationStore();
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const listChatMessageSeq = useSocketEventsStore((state) => state.listChatMessageSeq);
  const listChatUnreadSeq = useSocketEventsStore((state) => state.listChatUnreadSeq);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastNewBug = useSocketEventsStore((state) => state.lastNewBug);
  const lastSyncCompletedAt = useChatSyncStore((state) => state.lastSyncCompletedAt);
  const chatListDexieBump = useChatSyncStore((state) => state.chatListDexieBump);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const chatPrefetchSignature = useMemo(
    () => chats.slice(0, 18).map((c) => getChatKey(c)).join('\0'),
    [chats]
  );
  const [loading, setLoading] = useState(true);
  const urlQuery = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(urlQuery);
  const debouncedSearchQuery = useDebounce(searchInput, 500);
  const skipUrlSyncRef = useRef(false);
  const [contactsMode, setContactsMode] = useState(false);
  const [cityUsers, setCityUsers] = useState<BasicUser[]>([]);
  const [cityUsersLoading, setCityUsersLoading] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<BasicUser[]>([]);
  const [followersUsers, setFollowersUsers] = useState<BasicUser[]>([]);
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
  const draftsCacheRef = useRef<ChatDraft[] | null>(null);

  const getMergedDrafts = useCallback(
    async (forceRefetch = false): Promise<ChatDraft[]> => {
      if (!user?.id) return [];
      clearChatListModuleCacheWhenUserMismatch(user.id);
      if (chatListModuleCache.userId !== user.id) draftsCacheRef.current = null;
      if (!forceRefetch && chatListModuleCache.drafts !== null && chatListModuleCache.userId === user.id) {
        draftsCacheRef.current = chatListModuleCache.drafts;
        return chatListModuleCache.drafts;
      }
      if (!forceRefetch && draftsCacheRef.current !== null) return draftsCacheRef.current;
      const [res, local] = await Promise.all([
        chatApi.getUserDrafts(1, 1000).catch(() => ({ drafts: [] })),
        draftStorage.getLocalDraftsForUser(user.id)
      ]);
      const merged = mergeServerAndLocalDrafts(res?.drafts ?? [], local);
      draftsCacheRef.current = merged;
      chatListModuleCache.drafts = merged;
      chatListModuleCache.userId = user.id;
      return merged;
    },
    [user?.id]
  );

  useEffect(() => () => {
    draftsCacheRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || chatListDexieBump === 0) return;
    let cancelled = false;
    void loadThreadIndexForList(chatsFilter).then((fromDex) => {
      if (cancelled || fromDex.length === 0) return;
      setChats((prev) => mergeChatListOutboxFromDexieSlice(prev, fromDex));
      const cur = chatsCacheRef.current[chatsFilter];
      if (cur) {
        chatsCacheRef.current[chatsFilter] = {
          ...cur,
          chats: mergeChatListOutboxFromDexieSlice(cur.chats, fromDex),
        };
      }
      const mc = chatListModuleCache.chats[chatsFilter];
      if (mc && chatListModuleCache.userId === user.id) {
        chatListModuleCache.chats[chatsFilter] = {
          ...mc,
          chats: mergeChatListOutboxFromDexieSlice(mc.chats, fromDex),
        };
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chatListDexieBump, chatsFilter, user?.id]);

  const threadIndexLiveEnabled =
    !!user?.id &&
    !contactsMode &&
    debouncedSearchQuery.trim() === '' &&
    (chatsFilter === 'users' ||
      chatsFilter === 'bugs' ||
      chatsFilter === 'channels' ||
      chatsFilter === 'market');

  const dexThreadSlice = useChatListThreadIndexLive(
    threadIndexLiveEnabled ? chatsFilter : null,
    threadIndexLiveEnabled
  );

  const threadIndexLiveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadIndexLiveSigRef = useRef<string>('');

  useEffect(() => {
    threadIndexLiveSigRef.current = '';
  }, [chatsFilter, contactsMode, debouncedSearchQuery]);

  useEffect(() => {
    if (!threadIndexLiveEnabled || user?.id == null) return;
    if (dexThreadSlice === undefined) return;
    const sig = `${dexThreadSlice.length}|${threadIndexLiveMergeSig(dexThreadSlice)}`;
    if (sig === threadIndexLiveSigRef.current) return;
    threadIndexLiveSigRef.current = sig;
    const slice = dexThreadSlice;
    const uid = user.id;
    if (threadIndexLiveDebounceRef.current) clearTimeout(threadIndexLiveDebounceRef.current);
    threadIndexLiveDebounceRef.current = setTimeout(() => {
      threadIndexLiveDebounceRef.current = null;
      setChats((prev) => mergeChatListFromThreadIndexDexie(prev, slice, chatsFilter, uid));
      const cur = chatsCacheRef.current[chatsFilter];
      if (cur) {
        chatsCacheRef.current[chatsFilter] = {
          ...cur,
          chats: mergeChatListFromThreadIndexDexie(cur.chats, slice, chatsFilter, uid),
        };
      }
      const mc = chatListModuleCache.chats[chatsFilter];
      if (mc && chatListModuleCache.userId === uid) {
        chatListModuleCache.chats[chatsFilter] = {
          ...mc,
          chats: mergeChatListFromThreadIndexDexie(mc.chats, slice, chatsFilter, uid),
        };
      }
    }, 100);
    return () => {
      if (threadIndexLiveDebounceRef.current) {
        clearTimeout(threadIndexLiveDebounceRef.current);
        threadIndexLiveDebounceRef.current = null;
      }
    };
  }, [threadIndexLiveEnabled, dexThreadSlice, chatsFilter, user?.id, contactsMode, debouncedSearchQuery]);

  const applyDraftToCache = useCallback((
    draft: ChatDraft | null,
    chatContextType: string,
    contextId: string,
    chatType?: string
  ) => {
    if (draftsCacheRef.current === null) return;
    const sameSlot = (d: ChatDraft) =>
      d.chatContextType === chatContextType && d.contextId === contextId && (draft == null || d.chatType === (chatType ?? draft.chatType));
    if (draft === null) {
      draftsCacheRef.current = draftsCacheRef.current.filter(
        (d) =>
          !(
            d.chatContextType === chatContextType &&
            d.contextId === contextId &&
            (chatType == null || d.chatType === chatType)
          )
      );
    } else {
      draftsCacheRef.current = draftsCacheRef.current.filter((d) => !sameSlot(d));
      draftsCacheRef.current = [...draftsCacheRef.current, draft];
    }
    if (chatListModuleCache.userId === useAuthStore.getState().user?.id) {
      chatListModuleCache.drafts = draftsCacheRef.current;
    }
  }, []);

  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? chats.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, chats]
  );
  const marketChannelIdsKey = useMemo(() => {
    if (chatsFilter !== 'market' || marketChannelIds.length === 0) return '';
    return [...marketChannelIds].sort().join(',');
  }, [chatsFilter, marketChannelIds]);
  const marketUnreadCounts = useGroupChannelUnreadCounts(marketChannelIds);

  const presenceUserIds = useMemo(() => {
    const ids: string[] = [];
    chats.forEach((c) => {
      if (c.type === 'user') ids.push((c.data as UserChat).user1Id === user?.id ? (c.data as UserChat).user2Id : (c.data as UserChat).user1Id);
      else if (c.type === 'contact') ids.push(c.userId);
    });
    return ids;
  }, [chats, user?.id]);
  usePresenceSubscription('chat-list', presenceUserIds);

  useEffect(() => {
    if (skipUrlSyncRef.current) {
      skipUrlSyncRef.current = false;
      return;
    }
    setSearchInput(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (user?.id) {
      fetchFavorites();
    }
  }, [user?.id, fetchFavorites]);

  const fetchUsersSearchData = useCallback(async (): Promise<{ activeChats: ChatItem[]; cityUsers: BasicUser[]; usersHasMore: boolean }> => {
    if (!user) return { activeChats: [], cityUsers: [], usersHasMore: false };
    const { fetchPlayers, fetchUserChats } = usePlayersStore.getState();
    await fetchUserChats();
    const cityUsersData = await fetchPlayers();
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
      const groupUnreads = groupIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(groupIds)).data || {}
        : {};
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
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
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
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
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
      const channelUnreads = channelIds.length > 0
        ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {}
        : {};
      const chatItems = channelsToChatItems(channelList, channelUnreads, 'market', { filterByIsGroup: true, useUpdatedAtFallback: true, allDrafts });
      return { chats: chatItems, hasMore: channelsRes.pagination?.hasMore ?? false };
    } catch (err) {
      console.error('fetchMarket failed:', err);
      return { chats: [], hasMore: false };
    }
  }, [user, getMergedDrafts]);

  const fetchFilter = useCallback(
    async (filter: 'users' | 'bugs' | 'channels' | 'market') => {
      if (!user) return;
      const bf = useNavigationStore.getState().bugsFilter;
      const bugsFilterParams = (bf.status || bf.type || bf.createdByMe)
        ? { status: bf.status, type: bf.type, createdByMe: bf.createdByMe }
        : undefined;

      if (filter === 'users') {
        await usePlayersStore.getState().fetchUserChats();
        const cityUsersData = await usePlayersStore.getState().fetchPlayers();
        const allDrafts = await getMergedDrafts();
        const usersGroupsRes = await chatApi.getGroupChannels('users', 1);
        const usersGroupList = (usersGroupsRes.data || []) as GroupChannel[];
        const groupIds = usersGroupList.map((g: GroupChannel) => g.id);
        const groupUnreads =
          groupIds.length > 0 ? (await chatApi.getGroupChannelsUnreadCounts(groupIds)).data || {} : {};
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
        const usersChatItems = deduplicateChats(sortChatItems(activeChats, 'users', user?.id));
        const cityUsersArray = Array.isArray(cityUsersData) ? cityUsersData : [];
        const cacheEntry: FilterCache = {
          chats: usersChatItems,
          cityUsers: cityUsersArray,
          usersHasMore: usersGroupsRes.pagination?.hasMore ?? false
        };
        chatsCacheRef.current.users = cacheEntry;
        chatListModuleCache.chats.users = cacheEntry;
        chatListModuleCache.userId = user.id;
        chatListModuleCache.lastFetchTime = Date.now();
        void persistThreadIndexReplace('users', usersChatItems);
        return;
      }

      const allDrafts = await getMergedDrafts();
      if (filter === 'bugs') {
        const bugsRes = await chatApi.getGroupChannels('bugs', 1, bugsFilterParams);
        const channelList = (bugsRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads =
          channelIds.length > 0 ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {} : {};
        const bugsChatItems = channelsToChatItems(channelList, channelUnreads, 'bugs', {
          useUpdatedAtFallback: true,
          filterByIsGroup: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(bugsChatItems),
          bugsHasMore: bugsRes.pagination?.hasMore ?? false
        };
        chatsCacheRef.current.bugs = cacheEntry;
        chatListModuleCache.chats.bugs = cacheEntry;
        chatListModuleCache.userId = user.id;
        chatListModuleCache.lastFetchTime = Date.now();
        void persistThreadIndexReplace('bugs', cacheEntry.chats);
        return;
      }
      if (filter === 'channels') {
        const channelsRes = await chatApi.getGroupChannels('channels', 1);
        const channelList = (channelsRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads =
          channelIds.length > 0 ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {} : {};
        const channelsChatItems = channelsToChatItems(channelList, channelUnreads, 'channels', {
          filterByIsChannel: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(channelsChatItems),
          channelsHasMore: channelsRes.pagination?.hasMore ?? false
        };
        chatsCacheRef.current.channels = cacheEntry;
        chatListModuleCache.chats.channels = cacheEntry;
        chatListModuleCache.userId = user.id;
        chatListModuleCache.lastFetchTime = Date.now();
        void persistThreadIndexReplace('channels', cacheEntry.chats);
        return;
      }
      if (filter === 'market') {
        const marketRes = await chatApi.getGroupChannels('market', 1);
        const channelList = (marketRes.data || []) as GroupChannel[];
        const channelIds = channelList.map((c: GroupChannel) => c.id);
        const channelUnreads =
          channelIds.length > 0 ? (await chatApi.getGroupChannelsUnreadCounts(channelIds)).data || {} : {};
        const marketChatItems = channelsToChatItems(channelList, channelUnreads, 'market', {
          filterByIsGroup: true,
          useUpdatedAtFallback: true,
          allDrafts
        });
        const cacheEntry: FilterCache = {
          chats: deduplicateChats(marketChatItems),
          marketHasMore: marketRes.pagination?.hasMore ?? false
        };
        chatsCacheRef.current.market = cacheEntry;
        chatListModuleCache.chats.market = cacheEntry;
        chatListModuleCache.userId = user.id;
        chatListModuleCache.lastFetchTime = Date.now();
        void persistThreadIndexReplace('market', cacheEntry.chats);
      }
    },
    [user, getMergedDrafts]
  );

  const runCoalescedFilterFetch = useCallback(
    async (filter: ChatsFilterType) => {
      let p = chatListModuleCache.inFlightByFilter[filter];
      if (!p) {
        p = (async () => {
          try {
            await fetchFilter(filter);
          } finally {
            delete chatListModuleCache.inFlightByFilter[filter];
          }
        })();
        chatListModuleCache.inFlightByFilter[filter] = p;
      }
      await p;
    },
    [fetchFilter]
  );

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
      const cached = chatListModuleCache.chats[filter];
      if (!cached) return;
      chatsCacheRef.current[filter] = cached;
      setChats(deduplicateChats(cached.chats));
      if (filter === 'users') setMutedChats({});
      if (cached.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
      }
      applyPaginationState(filter, cached, paginationSetters);
    },
    [paginationSetters, runCoalescedFilterFetch]
  );

  useEffect(() => {
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels' && chatsFilter !== 'market') return;
    if (!user?.id) return;
    clearChatListModuleCacheWhenUserMismatch(user.id);
    const applyCacheToState = (cached: FilterCache) => {
      chatsCacheRef.current[chatsFilter] = cached;
      setChats(deduplicateChats(cached.chats));
      if (chatsFilter === 'users') setMutedChats({});
      if (cached.cityUsers) {
        setCityUsers(cached.cityUsers);
        setSearchableUsersData({ activeChats: cached.chats, cityUsers: cached.cityUsers });
      }
      applyPaginationState(chatsFilter, cached, paginationSetters);
    };
    const cached = chatListModuleCache.chats[chatsFilter];
    if (cached && chatListModuleCache.userId === user.id) {
      applyCacheToState(cached);
      setLoading(false);
      return;
    }
    if (chatsCacheRef.current[chatsFilter]) {
      applyCacheToState(chatsCacheRef.current[chatsFilter]!);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        let showedDisk = false;
        try {
          const fromDex = await loadThreadIndexForList(chatsFilter);
          if (!cancelled && fromDex.length > 0) {
            showedDisk = true;
            const dexOnly: FilterCache = { chats: deduplicateChats(fromDex) };
            if (chatsFilter === 'users') {
              dexOnly.cityUsers = [];
              dexOnly.usersHasMore = false;
            }
            if (chatsFilter === 'bugs') dexOnly.bugsHasMore = false;
            if (chatsFilter === 'channels') dexOnly.channelsHasMore = false;
            if (chatsFilter === 'market') dexOnly.marketHasMore = false;
            applyCacheToState(dexOnly);
            setLoading(false);
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
            setLoading(false);
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
            const c = chatListModuleCache.chats[currentFilter];
            if (c && chatListModuleCache.userId === user.id) {
              chatsCacheRef.current[currentFilter] = c;
              if (useNavigationStore.getState().chatsFilter !== currentFilter) return;
              setChats(deduplicateChats(c.chats));
              if (currentFilter === 'users') setMutedChats({});
              if (c.cityUsers) {
                setCityUsers(c.cityUsers);
                setSearchableUsersData({ activeChats: c.chats, cityUsers: c.cityUsers });
              }
              applyPaginationState(currentFilter, c, paginationSetters);
            }
          })();
          return;
        }
        const inflight = chatListModuleCache.inFlightByFilter[chatsFilter];
        if (inflight) {
          await inflight;
          if (cancelled) return;
          const after = chatListModuleCache.chats[chatsFilter];
          if (after && chatListModuleCache.userId === user.id) {
            applyCacheToState(after);
            setLoading(false);
            return;
          }
        }
        if (!showedDisk) setLoading(true);
        const currentFilter = chatsFilter;
        await runCoalescedFilterFetch(currentFilter);
        if (cancelled) return;
        const c = chatListModuleCache.chats[chatsFilter];
        if (c) applyCacheToState(c);
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch chats:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [fetchFilter, chatsFilter, paginationSetters, user?.id, runCoalescedFilterFetch]);

  const prevBugsFilterRef = useRef(bugsFilter);
  useEffect(() => {
    if (chatsFilter !== 'bugs') return;
    if (prevBugsFilterRef.current === bugsFilter) return;
    prevBugsFilterRef.current = bugsFilter;
    chatsCacheRef.current.bugs = undefined;
    chatListModuleCache.chats.bugs = undefined;
    let cancelled = false;
    fetchBugs(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      chatsCacheRef.current.bugs = { chats: deduped, bugsHasMore: hasMore };
      setChats(deduped);
      setBugsHasMore(hasMore);
      bugsPageRef.current = 1;
      void persistThreadIndexReplace('bugs', deduped);
    }).catch(async () => {
      if (cancelled) return;
      const d = await loadThreadIndexForList('bugs');
      if (d.length) setChats(deduplicateChats(d));
      else setChats([]);
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
      deduplicate: deduplicateChats,
      afterMore: (more) => void persistThreadIndexUpsert('bugs', more),
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
      deduplicate: deduplicateChats,
      afterMore: (more) => void persistThreadIndexUpsert('users', more),
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
      deduplicate: deduplicateChats,
      afterMore: (more) => void persistThreadIndexUpsert('channels', more),
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
      deduplicate: deduplicateChats,
      afterMore: (more) => void persistThreadIndexUpsert('market', more),
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
    const ids =
      chatsFilter === 'market'
        ? chatsRef.current.filter((c) => c.type === 'channel').map((c) => c.data.id)
        : [];
    if (ids.includes(data.contextId)) return;
    let cancelled = false;
    fetchMarket(1).then(({ chats, hasMore }) => {
      if (cancelled) return;
      const deduped = deduplicateChats(chats);
      chatsCacheRef.current.market = { chats: deduped, marketHasMore: hasMore };
      void persistThreadIndexReplace('market', deduped);
      if (chatsFilter === 'market') {
        setChats(deduped);
        setMarketHasMore(hasMore);
        marketPageRef.current = 1;
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [lastChatUnreadCount, marketChannelIdsKey, chatsFilter, fetchMarket]);

  const fetchCityUsers = useCallback(async () => {
    if (!user?.currentCity?.id) return;
    setCityUsersLoading(true);
    try {
      const response = await usersApi.getInvitablePlayers();
      setCityUsers(response.data?.players ?? []);
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
        usersApi.getInvitablePlayers().then((r) => r.data?.players ?? []).catch(() => []),
        favoritesApi.getFollowing().catch(() => []),
        favoritesApi.getFollowers().catch(() => [])
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
    if (!user?.id || !isOnline || chatPrefetchSignature.length === 0) return;
    const t = window.setTimeout(() => prefetchTopChatsSync(chatsRef.current), 450);
    return () => window.clearTimeout(t);
  }, [user?.id, isOnline, chatPrefetchSignature]);

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
    setChats,
    chatsCacheRef,
    draftsCacheRef,
    applyDraftToCache,
    bugsPageRef,
    setBugsHasMore,
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

  const handleChatClick = useCallback((chatId: string, chatType: ChatType, options?: { initialChatType?: string; searchQuery?: string }) => {
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
        chatsCacheRef.current.users = undefined;
        chatListModuleCache.chats.users = undefined;
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
        chatsCacheRef.current.users = undefined;
        chatListModuleCache.chats.users = undefined;
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

  const contactSections = useMemo(() => {
    const followingIds = new Set(followingUsers.map((u) => u.id));
    const followerIds = new Set(followersUsers.map((u) => u.id));
    const following = cityUsers.filter((u) => followingIds.has(u.id));
    const followers = cityUsers.filter((u) => followerIds.has(u.id) && !followingIds.has(u.id));
    const other = cityUsers.filter((u) => !followingIds.has(u.id) && !followerIds.has(u.id));
    return { following, followers, other };
  }, [cityUsers, followingUsers, followersUsers]);

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
  }, [user, chatsFilter, onChatSelect, isSearchMode, debouncedSearchQuery]);

  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [gamesExpanded, setGamesExpanded] = useState(true);
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [bugsExpanded, setBugsExpanded] = useState(true);
  const [marketListingsExpanded, setMarketListingsExpanded] = useState(true);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugsFilterPanelOpen, setBugsFilterPanelOpen] = useState(true);
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

  const showContactsEmpty = contactsMode && chatsFilter === 'users' && !isSearchMode && !cityUsersLoading && cityUsers.length === 0;
  const showChatsEmpty = !contactsMode && !isSearchMode && (chatsFilter === 'market' ? displayedChats.length === 0 : chats.length === 0) && !loading;

  return {
    loading,
    t,
    isDesktop,
    isRefreshing,
    pullDistance,
    pullProgress,
    setSearchParams,
    skipUrlSyncRef,
    setSearchInput,
    chatsFilter,
    contactsMode,
    searchInput,
    hasUnreadChats,
    unreadChatsCount,
    unreadFilterActive,
    setUnreadFilterActive,
    handleContactsToggle,
    setShowBugModal,
    handleCreateListing,
    user,
    bugsFilterPanelOpen,
    setBugsFilterPanelOpen,
    marketBuyerSellerUnread,
    marketChatRole,
    setMarketChatRole,
    listTransition,
    isSearchMode,
    cityUsersLoading,
    displayChats,
    debouncedSearchQuery,
    activeChatsExpanded,
    setActiveChatsExpanded,
    usersExpanded,
    setUsersExpanded,
    handleChatClick,
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
    contactSections,
    handleContactClick,
    showContactsEmpty,
    showChatsEmpty,
    marketGroupedByItem,
    handleMarketItemGroupClick,
    displayedChats,
    getChatKey,
    selectedChatId,
    selectedChatType,
    pinnedCountUsers,
    pinningId,
    handlePinUserChat,
    handlePinGroupChannel,
    mutedChats,
    togglingMuteId,
    handleMuteUserChat,
    handleMuteGroupChannel,
    bugsHasMore,
    usersHasMore,
    channelsHasMore,
    marketHasMore,
    loadMoreSentinelRef,
    bugsLoadingMore,
    usersLoadingMore,
    channelsLoadingMore,
    marketLoadingMore,
    showBugModal,
    handleBugCreated,
    selectedMarketItemForDrawer,
    closeMarketItemDrawer,
  };
}
