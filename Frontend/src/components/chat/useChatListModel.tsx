import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getChatKey } from '@/utils/chatListHelpers';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useDebounce } from '@/components/CityMap/useDebounce';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import {
  collectChatListPresenceUserIds,
  collectSearchRowsPresenceUserIds,
} from '@/utils/chatListPresenceIds';
import type { ChatsFilterType } from '@/components/chat/chatListModuleCache';
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
  const chatsFilter = useShellNavStore((s) => s.chatsFilter) as ChatsFilterType;
  const openBugModal = useGameDetailsChromeStore((s) => s.openBugModal);
  const setOpenBugModal = useGameDetailsChromeStore((s) => s.setOpenBugModal);

  const urlQuery = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(urlQuery);
  const debouncedSearchQuery = useDebounce(searchInput, 500);
  const skipUrlSyncRef = useRef(false);
  useChatListSearchUrlSync(urlQuery, skipUrlSyncRef, setSearchInput);

  const marketChatRole = (searchParams.get('role') === 'seller' ? 'seller' : 'buyer') as 'buyer' | 'seller';
  const [unreadFilterActive, setUnreadFilterActive] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugsFilterPanelOpen, setBugsFilterPanelOpen] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const listBodyScrollRef = useRef<HTMLDivElement>(null);

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

  const handleContactsToggle = useCallback(
    () => toggleContacts(skipUrlSyncRef, setSearchInput, searchData.fetchContactsData),
    [toggleContacts, searchData.fetchContactsData]
  );

  useEffect(() => {
    if (chatsFilter !== 'bugs') setBugsFilterPanelOpen(false);
  }, [chatsFilter]);
  useEffect(() => setUnreadFilterActive(false), [chatsFilter]);
  useEffect(() => {
    if (readModel.unreadChatsCount <= 0) setUnreadFilterActive(false);
  }, [readModel.unreadChatsCount]);
  useEffect(() => {
    if (chatsFilter !== 'users' || !debouncedSearchQuery.trim() || contactsMode) return;
    if (searchData.searchableUsersData?.cityUsers?.length) return;
    void searchData.fetchCityUsers();
  }, [chatsFilter, debouncedSearchQuery, contactsMode, searchData]);
  useEffect(() => {
    if (chatsFilter === 'bugs') return;
    if (chatsFilter === 'channels' && debouncedSearchQuery.trim().length >= 2 && !searchData.searchableUsersData) {
      void searchData.fetchUsersSearchData();
    }
  }, [chatsFilter, debouncedSearchQuery, searchData]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: refresh,
    disabled: loading || isDesktop,
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
    },
    pullRefresh: { isRefreshing, pullDistance, pullProgress },
    search: {
      searchInput,
      setSearchInput,
      debouncedSearchQuery,
      isSearchMode,
      displayChats,
      contactsMode,
      cityUsersLoading: searchData.cityUsersLoading,
      showContactsEmpty,
      unreadChatsCount: readModel.unreadChatsCount,
      unreadFilterActive,
      setUnreadFilterActive,
      skipUrlSyncRef,
      setSearchParams,
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
