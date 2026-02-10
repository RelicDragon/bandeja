import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import transliterate from '@sindresorhus/transliterate';
import { CityUserCard } from './CityUserCard';
import { ChatListItem } from './ChatListItem';
import { ChatListSearchBar } from './ChatListSearchBar';
import { chatApi, ChatDraft, getLastMessageTime, GroupChannel } from '@/api/chat';
import { matchDraftToChat } from '@/utils/chatListUtils';
import { getChatTitle, sortChatItems } from '@/utils/chatListSort';
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
import { MessageCircle } from 'lucide-react';
import { BugModal } from '@/components/bugs/BugModal';
import { BugsFilterPanel } from '@/components/bugs/BugsFilterPanel';
import { ChatMessageSearchResults } from './ChatMessageSearchResults';
import { CollapsibleSection } from './CollapsibleSection';
import { ChatMessage } from '@/api/chat';
import { useSocketEventsStore } from '@/store/socketEventsStore';
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
  const { user } = useAuthStore();
  const { chatsFilter, bugsFilter, openBugModal, setOpenBugModal } = useNavigationStore();
  const fetchFavorites = useFavoritesStore((state) => state.fetchFavorites);
  const lastChatMessage = useSocketEventsStore((state) => state.lastChatMessage);
  const lastChatUnreadCount = useSocketEventsStore((state) => state.lastChatUnreadCount);
  const lastNewBug = useSocketEventsStore((state) => state.lastNewBug);
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
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  const chatsCacheRef = useRef<Partial<Record<'users' | 'bugs' | 'channels', FilterCache>>>({});

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

  const fetchAllFilters = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [usersData, bugsResult, channelsResult] = await Promise.all([
        fetchUsersSearchData().catch(() => ({ activeChats: [], cityUsers: [], usersHasMore: false })),
        fetchBugs(1).catch(() => ({ chats: [], hasMore: false })),
        fetchChannels(1).catch(() => ({ chats: [], hasMore: false }))
      ]);

      const usersChatItems = deduplicateChats(usersData.activeChats);
      chatsCacheRef.current.users = { chats: usersChatItems, cityUsers: usersData.cityUsers, usersHasMore: usersData.usersHasMore };
      chatsCacheRef.current.bugs = { chats: deduplicateChats(bugsResult.chats), bugsHasMore: bugsResult.hasMore };
      chatsCacheRef.current.channels = { chats: deduplicateChats(channelsResult.chats), channelsHasMore: channelsResult.hasMore };

      const activeFilter = useNavigationStore.getState().chatsFilter;
      if (activeFilter === 'users' || activeFilter === 'bugs' || activeFilter === 'channels') {
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
            bugsPageRef,
            usersPageRef,
            channelsPageRef
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setLoading(false);
    }
  }, [user, fetchUsersSearchData, fetchBugs, fetchChannels]);

  const fetchChatsForFilter = useCallback(async (_filter?: 'users' | 'bugs' | 'channels') => {
    await fetchAllFilters();
  }, [fetchAllFilters]);

  const paginationSetters = useMemo(
    () => ({
      setBugsHasMore,
      setUsersHasMore,
      setChannelsHasMore,
      bugsPageRef,
      usersPageRef,
      channelsPageRef
    }),
    []
  );

  useEffect(() => {
    if (chatsFilter !== 'users' && chatsFilter !== 'bugs' && chatsFilter !== 'channels') return;
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

  const shouldLoadMore = (chatsFilter === 'bugs' && bugsHasMore && !bugsLoadingMore) ||
    (chatsFilter === 'users' && usersHasMore && !usersLoadingMore) ||
    (chatsFilter === 'channels' && channelsHasMore && !channelsLoadingMore);
  const loadMore = chatsFilter === 'bugs' ? loadMoreBugs : chatsFilter === 'users' ? loadMoreUsers : loadMoreChannels;

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
    if (chatsFilter === 'users' && debouncedSearchQuery.trim() && !contactsMode) {
      fetchCityUsers();
    }
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

    window.addEventListener('refresh-chat-list', handleRefresh);
    window.addEventListener('draft-updated', handleDraftUpdate);
    window.addEventListener('draft-deleted', handleDraftDelete);

    return () => {
      window.removeEventListener('refresh-chat-list', handleRefresh);
      window.removeEventListener('draft-updated', handleDraftUpdate);
      window.removeEventListener('draft-deleted', handleDraftDelete);
    };
  }, [fetchChatsForFilter, chatsFilter, updateChatDraft, updateChatMessage]);

  useEffect(() => {
    if (!lastChatMessage) return;

    const handleNewMessage = (data: { contextType: string; contextId: string; message: any }) => {
      const { contextType, contextId, message } = data;

      const shouldUpdate =
        (chatsFilter === 'users' && (contextType === 'USER' || contextType === 'GROUP')) ||
        (chatsFilter === 'bugs' && contextType === 'GROUP') ||
        (chatsFilter === 'channels' && contextType === 'GROUP');

      if (shouldUpdate) {
        setChats((prevChats) => {
          const chatExists = prevChats.some((chat) => {
            if (contextType === 'USER' && chat.type === 'user' && chat.data.id === contextId) return true;
            if (contextType === 'GROUP' && (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId) {
              if (chatsFilter === 'channels') return chat.type === 'channel';
              if (chatsFilter === 'users') return chat.type === 'group';
              if (chatsFilter === 'bugs') return chat.type === 'channel' && chat.data.bug;
              return true;
            }
            return false;
          });

          if (chatExists) {
            return deduplicateChats(updateChatMessage(prevChats, contextType, contextId, message));
          }

          return prevChats;
        });
      }
    };

    handleNewMessage(lastChatMessage);
  }, [lastChatMessage, chatsFilter, updateChatMessage]);

  useEffect(() => {
    if (!lastChatUnreadCount || lastChatUnreadCount.contextType !== 'GROUP') return;
    const { contextId, unreadCount } = lastChatUnreadCount;
    setChats((prev) =>
      prev.map((chat) =>
        (chat.type === 'group' || chat.type === 'channel') && chat.data.id === contextId
          ? { ...chat, unreadCount }
          : chat
      )
    );
  }, [lastChatUnreadCount]);

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
    if (chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') {
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

  const isSearchMode = debouncedSearchQuery.trim().length > 0 && (chatsFilter === 'users' || chatsFilter === 'channels' || chatsFilter === 'bugs');

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

  const unreadChatsCount = useMemo(
    () => chats
      .filter((c) => c.type === 'user' || c.type === 'group' || c.type === 'channel')
      .reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    [chats]
  );
  const hasUnreadChats = unreadChatsCount > 0;

  useEffect(() => {
    if (!hasUnreadChats) setUnreadFilterActive(false);
  }, [hasUnreadChats]);

  const displayedChats = useMemo(() => {
    if (!unreadFilterActive) return chats;
    return chats.filter((c) => (c.type === 'user' || c.type === 'group' || c.type === 'channel') && (c.unreadCount ?? 0) > 0);
  }, [chats, unreadFilterActive]);

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
  const showChatsEmpty = !contactsMode && !isSearchMode && chats.length === 0 && !loading;

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] py-12 text-gray-500 dark:text-gray-400">
      <MessageCircle size={64} className="mb-4 opacity-50" />
      <p className="text-lg font-medium">
        {showContactsEmpty && (user?.currentCity ? t('chat.noCityUsers', { defaultValue: 'No users in your city' }) : t('chat.noCitySet', { defaultValue: 'Set your city to see players' }))}
        {showChatsEmpty && t('chat.noConversations', { defaultValue: 'No conversations yet' })}
      </p>
      <p className="text-sm mt-2">
        {showContactsEmpty && user?.currentCity && t('chat.noCityUsersHint', { defaultValue: 'Try a different search' })}
        {showChatsEmpty && chatsFilter === 'users' && t('chat.noUserChats', { defaultValue: 'Start chatting with players' })}
        {showChatsEmpty && chatsFilter === 'bugs' && t('chat.noBugChats', { defaultValue: 'No bug reports yet' })}
        {showChatsEmpty && chatsFilter === 'channels' && t('chat.noChannels', { defaultValue: 'No channels yet' })}
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
        {(chatsFilter === 'users' || chatsFilter === 'bugs' || chatsFilter === 'channels') && (
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
              {displayedChats.map((chat) => (
                <ChatListItem
                  key={getChatKey(chat)}
                  item={chat}
                  selectedChatId={selectedChatId}
                  selectedChatType={selectedChatType}
                  onChatClick={handleChatClick}
                  onContactClick={handleContactClick}
                  isSearchMode={isSearchMode}
                  searchQuery={debouncedSearchQuery.trim()}
                />
              ))}
              {((chatsFilter === 'bugs' && bugsHasMore) || (chatsFilter === 'users' && usersHasMore) || (chatsFilter === 'channels' && channelsHasMore)) && (
                <div ref={loadMoreSentinelRef} className="py-4 flex justify-center">
                  {(bugsLoadingMore || usersLoadingMore || channelsLoadingMore) && (
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
    </>
  );
};
