import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getChatKey } from '@/utils/chatListHelpers';
import { useBrowseCityStore } from '@/store/browseCityStore';
import { useResolvedBrowseCity } from '@/hooks/useResolvedBrowseCity';
import { useNearbyPeopleSearch } from '@/hooks/useNearbyPeopleSearch';
import { useShellNavStore } from '@/store/shellNavStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import {
  collectChatListPresenceUserIds,
  collectSearchRowsPresenceUserIds,
} from '@/utils/chatListPresenceIds';
import { CHAT_LIST_PULL_TRANSITION_S } from '@/components/chat/chatListMotion';
import { useChatListFeedStore, type ChatsFilterType } from '@/components/chat/chatListFeedStore';
import type { ChatListViewModel } from '@/components/chat/chatListViewModel.types';
import { useChatInbox } from '@/services/chat/inbox/useChatInbox';
import { useChatListSearchUrlSync } from '@/components/chat/useChatListSearchUrlSync';
import { useChatListContactSections } from '@/components/chat/useChatListContactSections';
import { useChatListSearchPresenter } from '@/components/chat/useChatListSearchPresenter';
import { useChatListMarketDrawer } from '@/components/chat/useChatListMarketDrawer';
import { useChatListPinMuteActions } from '@/components/chat/useChatListPinMuteActions';
import {
  useChatListContactsMode,
  useChatListExpandableSections,
} from '@/components/chat/useChatListPresenterUi';
import type { ChatListProps, ChatType } from './chatListTypes';
import {
  clearChatListUnreadUrlParam,
  isChatListUnreadUrlActive,
  toggleChatListUnreadUrlParam,
} from '@/components/chat/chatListUnreadUrl';

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
  const browseCity = useResolvedBrowseCity();
  const browseCityId = useBrowseCityStore((s) => s.cityId);
  const chatsFilter = useShellNavStore((s) => s.chatsFilter) as ChatsFilterType;
  const openBugModal = useGameDetailsChromeStore((s) => s.openBugModal);
  const setOpenBugModal = useGameDetailsChromeStore((s) => s.setOpenBugModal);

  const urlQuery = searchParams.get('q') ?? '';
  /** Already debounced: `ChatListSearchBar` owns the raw keystrokes and lifts only the settled query. */
  const [debouncedSearchQuery, setSearchInput] = useState(urlQuery);
  const skipUrlSyncRef = useRef(false);
  useChatListSearchUrlSync(urlQuery, skipUrlSyncRef, setSearchInput);

  const marketChatRole = (searchParams.get('role') === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller';
  const unreadFilterActive = isChatListUnreadUrlActive(searchParams);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugsFilterPanelOpen, setBugsFilterPanelOpen] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const listBodyScrollRef = useRef<HTMLDivElement>(null);
  const networkSettled = useChatListFeedStore((s) => s.networkSettledByFilter[chatsFilter]);

  const { contactsMode, listTransition, handleContactsToggle: toggleContacts } =
    useChatListContactsMode(chatsFilter);

  const inbox = useChatInbox({
    chatsFilter,
    isDesktop,
    selectedChatId,
    selectedChatType,
    debouncedSearchQuery,
    contactsMode,
    unreadFilterActive,
    marketChatRole,
  });

  const {
    readModel,
    threads,
    loading,
    pagination,
    refresh,
    fetchChatsForFilter,
    loadMore,
    shouldLoadMore,
    searchData,
    mutedChats,
    handleContactClick: inboxContactClick,
    adapter,
    setMutedChats,
  } = inbox;

  const pinMute = useChatListPinMuteActions(fetchChatsForFilter, adapter, setMutedChats);
  const sections = useChatListExpandableSections();

  const activeChats = useMemo(
    () => threads.filter((c) => c.type === 'user' || c.type === 'group' || c.type === 'game'),
    [threads]
  );

  const { isSearchMode, displayChats } = useChatListSearchPresenter({
    chatsFilter,
    debouncedSearchQuery,
    contactsMode,
    userId: user?.id,
    activeChats,
    cityUsers: searchData.cityUsers,
    searchableUsersData: searchData.searchableUsersData,
  });

  const nearbySearch = useNearbyPeopleSearch({
    enabled:
      chatsFilter === 'users' &&
      isSearchMode &&
      !contactsMode &&
      !searchData.cityUsersLoading &&
      displayChats.every((row) => row.type !== 'contact'),
    query: debouncedSearchQuery,
    cityId: browseCity.cityId,
  });

  const contactSections = useChatListContactSections(
    searchData.cityUsers,
    searchData.followingUsers,
    searchData.followersUsers
  );
  const marketDrawer = useChatListMarketDrawer(chatsFilter, marketChatRole, readModel.displayedChats);

  const setMarketChatRole = useCallback(
    (role: 'buyer' | 'seller') => {
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set('role', role);
        return p;
      }, { replace: true });
    },
    [setSearchParams]
  );

  const toggleUnreadFilter = useCallback(() => {
    setSearchParams((prev) => toggleChatListUnreadUrlParam(prev));
  }, [setSearchParams]);

  const handleSearchChange = useCallback(
    (value: string) => {
      skipUrlSyncRef.current = true;
      setSearchInput(value);
      setSearchParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value.trim()) next.set('q', value);
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleClearSearch = useCallback(() => {
    skipUrlSyncRef.current = true;
    setSearchInput('');
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('q');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const handleContactsToggle = useCallback(
    () => toggleContacts(skipUrlSyncRef, setSearchInput, searchData.fetchContactsData),
    [toggleContacts, searchData.fetchContactsData]
  );

  useEffect(() => {
    if (chatsFilter !== 'bugs') setBugsFilterPanelOpen(false);
  }, [chatsFilter]);
  useEffect(() => {
    if (readModel.unreadChatsCount > 0) return;
    if (!isChatListUnreadUrlActive(searchParams)) return;
    setSearchParams((prev) => clearChatListUnreadUrlParam(prev), { replace: true });
  }, [readModel.unreadChatsCount, searchParams, setSearchParams]);
  useEffect(() => {
    if (chatsFilter !== 'users' || !contactsMode) return;
    void searchData.fetchContactsData();
  }, [browseCityId, chatsFilter, contactsMode, searchData]);
  const searchingUsers = debouncedSearchQuery.trim().length > 0;
  useEffect(() => {
    if (chatsFilter !== 'users' || contactsMode || !searchingUsers) return;
    void searchData.fetchCityUsers();
  }, [browseCityId, chatsFilter, contactsMode, searchData, searchingUsers]);
  useEffect(() => {
    if (chatsFilter === 'bugs') return;
    if (chatsFilter === 'channels' && debouncedSearchQuery.trim().length >= 2 && !searchData.searchableUsersData) {
      void searchData.fetchUsersSearchData();
    }
  }, [chatsFilter, debouncedSearchQuery, searchData]);

  /**
   * Pull distance is written to CSS variables on the list shell instead of React state:
   * a touchmove used to re-render the whole inbox (and re-measure every animated row).
   */
  const pullShellRef = useRef<HTMLDivElement>(null);
  const publishPullDistance = useCallback(
    (distance: number, progress: number, refreshing: boolean) => {
      const el = pullShellRef.current;
      if (!el) return;
      el.style.setProperty('--chat-pull-distance', `${distance}px`);
      el.style.setProperty('--chat-pull-progress', `${progress}`);
      el.style.setProperty('--chat-pull-visibility', distance > 0 ? 'visible' : 'hidden');
      /** Follow the finger instantly while dragging; ease back once released or refreshing. */
      el.style.setProperty(
        '--chat-pull-transition',
        distance > 0 && !refreshing ? 'none' : `transform ${CHAT_LIST_PULL_TRANSITION_S}s ease-out`
      );
    },
    []
  );
  const { isRefreshing } = usePullToRefresh({
    onRefresh: refresh,
    disabled: loading || isDesktop,
    onPullDistanceChange: publishPullDistance,
  });

  const handleBugCreated = useCallback(
    (groupChannelId?: string) => {
      setShowBugModal(false);
      if (chatsFilter === 'bugs') void fetchChatsForFilter('bugs');
      if (groupChannelId && onChatSelect) onChatSelect(groupChannelId, 'channel');
    },
    [chatsFilter, fetchChatsForFilter, onChatSelect]
  );

  const handleChatClick = useCallback(
    (chatId: string, chatType: ChatType, options?: Parameters<NonNullable<ChatListProps['onChatSelect']>>[2]) => {
      onChatSelect?.(chatId, chatType, options);
    },
    [onChatSelect]
  );

  const handleCreateListing = useCallback(() => navigate('/marketplace/create'), [navigate]);

  const onContactClick = useCallback(
    (userId: string) => {
      void inboxContactClick(userId, onChatSelect, isSearchMode ? debouncedSearchQuery.trim() : undefined);
    },
    [inboxContactClick, onChatSelect, isSearchMode, debouncedSearchQuery]
  );

  useLayoutEffect(() => {
    const el = listBodyScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [chatsFilter]);

  useLayoutEffect(() => {
    if (!shouldLoadMore || loading) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root: listBodyScrollRef.current ?? null, rootMargin: '100px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoadMore, loadMore, loading, readModel.displayedChats.length, isSearchMode, contactsMode, marketChatRole, chatsFilter]);

  const listPresenceUserIds = useMemo(() => {
    if (loading) return [];
    if (isSearchMode) return collectSearchRowsPresenceUserIds(displayChats, user?.id);
    if (chatsFilter === 'market' && marketDrawer.marketGroupedByItem) {
      return collectChatListPresenceUserIds(
        marketDrawer.marketGroupedByItem.flatMap((g) => g.channels),
        user?.id
      );
    }
    return collectChatListPresenceUserIds(readModel.displayedChats, user?.id);
  }, [loading, isSearchMode, displayChats, readModel.displayedChats, user?.id, chatsFilter, marketDrawer.marketGroupedByItem]);

  usePresenceSubscription(
    loading ? 'chat-list:loading' : isSearchMode ? `chat-list-search:${chatsFilter}` : `chat-list:${chatsFilter}`,
    listPresenceUserIds
  );

  useEffect(() => {
    if (openBugModal && chatsFilter === 'bugs') {
      setShowBugModal(true);
      setOpenBugModal(false);
    }
  }, [openBugModal, chatsFilter, setOpenBugModal]);

  const showContactsEmpty =
    contactsMode && chatsFilter === 'users' && !isSearchMode && !searchData.cityUsersLoading && searchData.cityUsers.length === 0;
  const showChatsEmpty =
    !contactsMode &&
    !isSearchMode &&
    (chatsFilter === 'market' ? readModel.displayedChats.length === 0 : threads.length === 0) &&
    !loading;

  return {
    t,
    isDesktop,
    user: user ?? null,
    feed: {
      loading,
      chatsFilter,
      displayedChats: readModel.displayedChats,
      chats: threads,
      bugsHasMore: pagination.bugsHasMore,
      usersHasMore: pagination.usersHasMore,
      channelsHasMore: pagination.channelsHasMore,
      marketHasMore: pagination.marketHasMore,
      bugsLoadingMore: pagination.bugsLoadingMore,
      usersLoadingMore: pagination.usersLoadingMore,
      channelsLoadingMore: pagination.channelsLoadingMore,
      marketLoadingMore: pagination.marketLoadingMore,
      loadMoreSentinelRef,
      listBodyScrollRef,
      showChatsEmpty,
      pinnedCountUsers: readModel.pinnedCountUsers,
      getChatKey,
      networkSettled,
    },
    pullRefresh: { isRefreshing, pullShellRef },
    search: {
      searchInput: debouncedSearchQuery,
      setSearchInput,
      onSearchChange: handleSearchChange,
      onClearSearch: handleClearSearch,
      debouncedSearchQuery,
      isSearchMode,
      displayChats,
      contactsMode,
      cityUsersLoading: searchData.cityUsersLoading,
      showContactsEmpty,
      unreadChatsCount: readModel.unreadChatsCount,
      unreadFilterActive,
      toggleUnreadFilter,
      nearbyGroups: nearbySearch.groups,
      nearbyLoading: nearbySearch.loading,
      browseCityName: browseCity.name,
    },
    market: {
      marketChatRole,
      setMarketChatRole,
      marketBuyerSellerUnread: readModel.marketBuyerSellerUnread,
      marketGroupedByItem: marketDrawer.marketGroupedByItem,
      selectedMarketItemForDrawer: marketDrawer.selectedMarketItemForDrawer,
      closeMarketItemDrawer: marketDrawer.closeMarketItemDrawer,
      handleMarketItemGroupClick: marketDrawer.handleMarketItemGroupClick,
      handleCreateListing,
    },
    contacts: {
      contactSections,
      handleContactsToggle,
      handleContactClick: onContactClick,
      listTransition,
    },
    sections,
    actions: { handleChatClick, ...pinMute, mutedChats },
    modals: {
      showBugModal,
      setShowBugModal,
      handleBugCreated,
      bugsFilterPanelOpen,
      setBugsFilterPanelOpen,
    },
    selection: { selectedChatId, selectedChatType },
  };
}
