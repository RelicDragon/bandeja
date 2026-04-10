import { AnimatePresence, motion } from 'framer-motion';
import { Package, ShoppingCart, Store } from 'lucide-react';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { ChatListSearchBar } from './ChatListSearchBar';
import { BugsFilterPanel } from '@/components/bugs/BugsFilterPanel';
import { ChatMessageSearchResults } from './ChatMessageSearchResults';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { BugModal } from '@/components/bugs/BugModal';
import { MarketItemDrawer } from '@/components/marketplace';
import { CityUserCard } from './CityUserCard';
import { ChatListDisplayedRows } from './ChatListDisplayedRows';
import { ChatListMarketGroupChannels } from './ChatListMarketGroupChannels';
import { ChatListLoadingSkeleton } from '@/components/chat/ChatListLoadingSkeleton';
import { ChatListEmptyPanel } from '@/components/chat/ChatListEmptyPanel';
import { ChatListSearchSections, type ChatListSearchSectionsSharedProps } from './ChatListSearchSections';
import { useChatListModel } from './useChatListModel';
export type ChatListViewModel = ReturnType<typeof useChatListModel>;

export function ChatListView({ model }: { model: ChatListViewModel }) {
  const {
    loading,
    activeChatsExpanded,
    bugsExpanded,
    bugsFilterPanelOpen,
    bugsHasMore,
    bugsLoadingMore,
    channelsExpanded,
    channelsHasMore,
    channelsLoadingMore,
    chatsFilter,
    cityUsersLoading,
    closeMarketItemDrawer,
    contactSections,
    contactsMode,
    debouncedSearchQuery,
    displayChats,
    displayedChats,
    gamesExpanded,
    handleBugCreated,
    handleChatClick,
    handleContactClick,
    handleContactsToggle,
    handleCreateListing,
    handleMarketItemGroupClick,
    handleMuteGroupChannel,
    handleMuteUserChat,
    handlePinGroupChannel,
    handlePinUserChat,
    hasUnreadChats,
    isDesktop,
    isRefreshing,
    isSearchMode,
    listTransition,
    loadMoreSentinelRef,
    listBodyScrollRef,
    marketBuyerSellerUnread,
    marketChatRole,
    marketGroupedByItem,
    marketHasMore,
    marketListingsExpanded,
    marketLoadingMore,
    messagesExpanded,
    mutedChats,
    pinningId,
    pinnedCountUsers,
    pullDistance,
    pullProgress,
    searchInput,
    selectedChatId,
    selectedChatType,
    selectedMarketItemForDrawer,
    setActiveChatsExpanded,
    setBugsExpanded,
    setBugsFilterPanelOpen,
    setChannelsExpanded,
    setGamesExpanded,
    setMarketChatRole,
    setMarketListingsExpanded,
    setMessagesExpanded,
    setSearchInput,
    setSearchParams,
    setShowBugModal,
    setUnreadFilterActive,
    showBugModal,
    showChatsEmpty,
    showContactsEmpty,
    skipUrlSyncRef,
    t,
    togglingMuteId,
    unreadChatsCount,
    unreadFilterActive,
    user,
    usersExpanded,
    usersHasMore,
    usersLoadingMore,
    setUsersExpanded
  } = model;

  if (loading) {
    return (
      <ChatListLoadingSkeleton
        isDesktop={isDesktop}
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
    );
  }

  const chatListSearchSectionProps: ChatListSearchSectionsSharedProps = {
    scrollElementRef: listBodyScrollRef,
    displayChats,
    t,
    activeChatsExpanded,
    setActiveChatsExpanded,
    usersExpanded,
    setUsersExpanded,
    selectedChatId,
    selectedChatType,
    handleChatClick,
    handleContactClick,
    isSearchMode,
    debouncedSearchQuery,
    chatsFilter,
    pinnedCountUsers,
    pinningId,
    handlePinUserChat,
    handlePinGroupChannel,
    mutedChats,
    togglingMuteId,
    handleMuteUserChat,
    handleMuteGroupChannel,
    listPresenceBatched: true,
  };

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
          ref={listBodyScrollRef}
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
                    scrollElementRef={listBodyScrollRef}
                    query={debouncedSearchQuery}
                    chatsFilter={chatsFilter}
                    insertBetween={
                      <ChatListSearchSections order="active-first" {...chatListSearchSectionProps} />
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
                    scrollElementRef={listBodyScrollRef}
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
                      <ChatListSearchSections order="users-first" {...chatListSearchSectionProps} />
                    ) : (
                      <ChatListSearchSections order="active-first" {...chatListSearchSectionProps} />
                    )}
                    <ChatMessageSearchResults
                      scrollElementRef={listBodyScrollRef}
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
              <ChatListEmptyPanel
                chatsFilter={chatsFilter}
                showContactsEmpty={showContactsEmpty}
                showChatsEmpty={showChatsEmpty}
                userHasCity={!!user?.currentCity}
                debouncedSearchQuery={debouncedSearchQuery}
                marketChatRole={marketChatRole}
                t={t}
              />
            ) : (
            <>
              {contactSections.following.length > 0 && (
                <>
                  <div className="px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                    {t('profile.following')}
                  </div>
                  {contactSections.following.map((cityUser) => (
                    <CityUserCard
                      key={cityUser.id}
                      user={cityUser}
                      onClick={() => handleContactClick(cityUser.id)}
                    />
                  ))}
                </>
              )}
              {contactSections.followers.length > 0 && (
                <>
                  <div className="px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                    {t('profile.followers')}
                  </div>
                  {contactSections.followers.map((cityUser) => (
                    <CityUserCard
                      key={cityUser.id}
                      user={cityUser}
                      onClick={() => handleContactClick(cityUser.id)}
                    />
                  ))}
                </>
              )}
              <div className="px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                {contactSections.following.length === 0 && contactSections.followers.length === 0
                  ? t('chat.users', { defaultValue: 'Users' })
                  : t('chat.otherUsers', { defaultValue: 'Other users' })}
              </div>
              {contactSections.other.map((cityUser) => (
                <CityUserCard
                  key={cityUser.id}
                  user={cityUser}
                  onClick={() => handleContactClick(cityUser.id)}
                />
              ))}
            </>
            )
          ) : showChatsEmpty ? (
            <ChatListEmptyPanel
              chatsFilter={chatsFilter}
              showContactsEmpty={showContactsEmpty}
              showChatsEmpty={showChatsEmpty}
              userHasCity={!!user?.currentCity}
              debouncedSearchQuery={debouncedSearchQuery}
              marketChatRole={marketChatRole}
              t={t}
            />
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
                      <ChatListMarketGroupChannels
                        scrollElementRef={listBodyScrollRef}
                        channels={group.channels}
                        selectedChatId={selectedChatId}
                        selectedChatType={selectedChatType}
                        onChatClick={handleChatClick}
                        onContactClick={handleContactClick}
                        isSearchMode={isSearchMode}
                        searchQuery={debouncedSearchQuery.trim()}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <ChatListDisplayedRows
                  scrollElementRef={listBodyScrollRef}
                  displayedChats={displayedChats}
                  selectedChatId={selectedChatId}
                  selectedChatType={selectedChatType}
                  onChatClick={handleChatClick}
                  onContactClick={handleContactClick}
                  isSearchMode={isSearchMode}
                  searchQuery={debouncedSearchQuery.trim()}
                  chatsFilter={chatsFilter}
                  marketChatRole={marketChatRole}
                  userId={user?.id}
                  loadMoreSentinelRef={loadMoreSentinelRef}
                  showLoadMoreRow={
                    (chatsFilter === 'bugs' && bugsHasMore) ||
                    (chatsFilter === 'users' && usersHasMore) ||
                    (chatsFilter === 'channels' && channelsHasMore) ||
                    (chatsFilter === 'market' && marketHasMore)
                  }
                  loadMoreSpinner={
                    bugsLoadingMore || usersLoadingMore || channelsLoadingMore || marketLoadingMore
                  }
                  pinnedCountUsers={pinnedCountUsers}
                  pinningId={pinningId}
                  onPinUserChat={handlePinUserChat}
                  onPinGroupChannel={handlePinGroupChannel}
                  mutedChats={mutedChats}
                  togglingMuteId={togglingMuteId}
                  onMuteUserChat={handleMuteUserChat}
                  onMuteGroupChannel={handleMuteGroupChannel}
                />
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
}
