import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/api/chat';
import { MessageList } from '@/components/MessageList';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { MarketItemPanel } from '@/components/marketplace';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameChatProps } from './GameChat/types';
import { GameChatHeaderSection } from './GameChat/GameChatHeaderSection';
import { GameChatTabs } from './GameChat/GameChatTabs';
import { GameChatFooter } from './GameChat/GameChatFooter';
import { GameChatAccessDenied } from './GameChat/GameChatAccessDenied';
import { ThreadViewProvider } from './GameChat/ThreadViewProvider';
import { useThreadChrome, useThreadMessages, useThreadScroll } from './GameChat/useThreadView';
import { ChatAutoTranslateContext } from '@/contexts/ChatAutoTranslateContext';
import { parseGameSport } from '@/utils/gameSport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';

export const GameChat: React.FC<GameChatProps> = (props) => (
  <ThreadViewProvider {...props}>
    <GameChatLayout />
  </ThreadViewProvider>
);

const GameChatLayout: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { setBottomTabsVisible } = useShellNavStore();
  const chrome = useThreadChrome();
  const msgs = useThreadMessages();
  const scroll = useThreadScroll();
  const {
    id,
    contextType,
    isEmbedded,
    game,
    bug,
    userChat,
    groupChannel,
    setGroupChannel,
    setGroupChannelParticipantsCount,
    loadContext,
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    handlePinnedBarClick,
    derived,
    footerVariant,
    panels,
    autoTranslateLanguageCodes,
    handleLeaveChat,
    handleJoinChannel,
    handleChatTypeChange,
    leaveModalLabels,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    chatContainerRef,
    showLoadingHeader,
    navigate,
    currentChatType,
    isThreadOpenSettling,
    isInitialLoad,
    isSwitchingChatType,
  } = chrome;
  const {
    messages,
    hasMoreMessages,
    isLoadingMessages,
    isLoadingMore,
    loadMessages,
    loadMoreMessages,
    handleAddReaction,
    handleRemoveReaction,
    handleDeleteMessage,
    handleReplyMessage,
    handleEditMessage,
    handlePollUpdated,
    handleResendQueued,
    handleRemoveFromQueue,
    handlePinMessage,
    handleUnpinMessage,
    handleForwardMessage,
    handleChatRequestRespond,
  } = msgs;
  const {
    messageListRef,
    initialScroll,
    openPaintGeneration,
    threadScrollKey,
    setChatNearBottom,
    handleScrollToMessage,
  } = scroll;

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => setBottomTabsVisible(true);
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(panels.handleBackButton);

  const pinnedBarSkipAnimationRef = useRef(true);
  const chromeSettling = isThreadOpenSettling || isInitialLoad;
  useEffect(() => {
    pinnedBarSkipAnimationRef.current = true;
  }, [threadScrollKey]);
  useEffect(() => {
    if (pinnedMessagesOrdered.length > 0 && pinnedBarSkipAnimationRef.current) {
      pinnedBarSkipAnimationRef.current = false;
    }
  }, [pinnedMessagesOrdered.length, threadScrollKey]);
  const pinnedBarAnimate = !pinnedBarSkipAnimationRef.current && !chromeSettling;
  const isThreadInitializing =
    isInitialLoad || isLoadingMessages || isThreadOpenSettling || initialScroll === undefined;
  const effectiveFooterVariant =
    footerVariant?.type === 'input' && isThreadInitializing
      ? ({ type: 'contextLoading' } as const)
      : footerVariant;
  const pinnedBarIds = useMemo(() => pinnedMessages.map((m) => m.id), [pinnedMessages]);
  const showGameChatTabs =
    !showLoadingHeader &&
    contextType === 'GAME' &&
    ((derived.isParticipant && derived.isPlayingParticipant) ||
      derived.isAdminOrOwner ||
      (game?.status && game.status !== 'ANNOUNCED'));
  const gameChatTabsVisible = showGameChatTabs && derived.availableChatTypes.length > 1;

  if (!derived.canViewPublicChat) {
    return <GameChatAccessDenied id={id} navigate={navigate} />;
  }

  const chatLevelSport = contextType === 'GAME' && game ? parseGameSport(game.sport) : undefined;

  return (
    <SportLevelProvider sport={chatLevelSport}>
      <div
        ref={chatContainerRef}
        className={`chat-container relative bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden overflow-x-hidden ${isEmbedded ? 'chat-embedded h-full' : 'h-screen'} ${(panels.showParticipantsPage || panels.showItemPage) ? 'hidden' : ''}`}
      >
        <GameChatHeaderSection />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative">
          <div className="relative flex-1 flex flex-col min-h-0">
            {showGameChatTabs && (
              <div
                className={
                  chromeSettling
                    ? 'absolute top-0 left-0 right-0 z-[3]'
                    : 'relative flex-shrink-0 z-[2]'
                }
              >
                <GameChatTabs
                  availableChatTypes={derived.availableChatTypes}
                  currentChatType={currentChatType}
                  isSwitchingChatType={isSwitchingChatType}
                  onChatTypeChange={handleChatTypeChange}
                />
              </div>
            )}
            <AnimatePresence>
              {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && (
                <motion.div
                  key="pinned-bar"
                  initial={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : false}
                  animate={{ opacity: 1, maxHeight: pinnedBarAnimate ? 80 : undefined }}
                  exit={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : undefined}
                  transition={pinnedBarAnimate ? { duration: 0.25, ease: 'easeInOut' } : { duration: 0 }}
                  className={`${
                    chromeSettling
                      ? `absolute left-0 right-0 z-[2] ${gameChatTabsVisible ? 'top-12' : 'top-0'}`
                      : 'relative'
                  } overflow-hidden`}
                >
                  <PinnedMessagesBar
                    pinnedMessages={[pinnedMessagesOrdered[0]]}
                    currentIndex={pinnedBarTopIndex + 1}
                    totalCount={pinnedMessages.length}
                    loadingScrollTargetId={loadingScrollTargetId}
                    onItemClick={handlePinnedBarClick}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && !chromeSettling && (
                <motion.div key="pinned-shadow" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute top-0 left-0 right-0 z-[1] pointer-events-none">
                  <div className="h-4 w-full dark:hidden" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), transparent)' }} />
                  <div className="h-4 w-full hidden dark:block" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), transparent)' }} />
                </motion.div>
              )}
            </AnimatePresence>

            {!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage && (
              <ChatContextPanel
                contextType={contextType as 'GAME' | 'USER' | 'GROUP'}
                bug={bug}
                marketItem={groupChannel?.marketItem}
                groupChannel={groupChannel}
                canEditBug={derived.canEditBug}
                onUpdate={() => id && loadContext({ force: true }).then(() => loadMessages())}
                onJoinChannel={handleJoinChannel}
              />
            )}

            {contextType === 'GROUP' && derived.isItemChat && (panels.showItemPage || panels.isItemPageAnimating) && groupChannel?.marketItem && (
              <div
                className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
                  panels.showItemPage && !panels.isItemPageAnimating ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-full z-0 pointer-events-none'
                }`}
                onTransitionEnd={() => panels.isItemPageAnimating && !panels.showItemPage && panels.setIsItemPageAnimating(false)}
              >
                <MarketItemPanel
                  item={groupChannel.marketItem}
                  onClose={panels.closeItemPage}
                  onItemUpdate={() => id && loadContext({ force: true }).then(() => loadMessages())}
                />
              </div>
            )}

            {contextType === 'GROUP' && !derived.isItemChat && (panels.showParticipantsPage || panels.isParticipantsPageAnimating) && groupChannel && (
              <div
                className={`absolute inset-0 h-full transition-all duration-300 ease-in-out bg-gray-50 dark:bg-gray-900 ${
                  panels.showParticipantsPage && !panels.isParticipantsPageAnimating ? 'opacity-100 translate-x-0 z-10' : 'opacity-0 translate-x-full z-0 pointer-events-none'
                }`}
                onTransitionEnd={() => panels.isParticipantsPageAnimating && !panels.showParticipantsPage && panels.setIsParticipantsPageAnimating(false)}
              >
                <GroupChannelSettings
                  groupChannel={groupChannel}
                  onParticipantsCountChange={setGroupChannelParticipantsCount}
                  onUpdate={async () => {
                    if (id) {
                      const updated = await chatApi.getGroupChannelById(id);
                      setGroupChannel(updated.data);
                      setGroupChannelParticipantsCount(updated.data.participantsCount || 0);
                    }
                  }}
                />
              </div>
            )}

            <div
              className={`flex-1 flex flex-col min-h-0 ${
                panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating
                  ? 'opacity-0 -translate-x-full transition-all duration-300 ease-in-out'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              <ChatAutoTranslateContext.Provider value={autoTranslateLanguageCodes}>
                <MessageList
                  ref={messageListRef}
                  messages={messages}
                  onChatScrollNearBottomChange={setChatNearBottom}
                  onAddReaction={handleAddReaction}
                  onRemoveReaction={handleRemoveReaction}
                  onDeleteMessage={handleDeleteMessage}
                  onReplyMessage={handleReplyMessage}
                  onEditMessage={handleEditMessage}
                  onPollUpdated={handlePollUpdated}
                  onResendQueued={handleResendQueued}
                  onRemoveFromQueue={handleRemoveFromQueue}
                  isLoading={isLoadingMore}
                  isLoadingMessages={isLoadingMessages}
                  isSwitchingChatType={isSwitchingChatType}
                  onScrollToMessage={handleScrollToMessage}
                  hasMoreMessages={hasMoreMessages}
                  onLoadMore={loadMoreMessages}
                  isInitialLoad={isInitialLoad}
                  isLoadingMore={isLoadingMore}
                  isChannel={derived.isChannel}
                  userChatUser1Id={contextType === 'USER' && userChat ? userChat.user1Id : undefined}
                  userChatUser2Id={contextType === 'USER' && userChat ? userChat.user2Id : undefined}
                  onChatRequestRespond={handleChatRequestRespond}
                  hasContextPanel={!panels.showParticipantsPage && !panels.showItemPage}
                  pinnedMessageIds={pinnedBarIds}
                  onPin={derived.canWriteChat ? handlePinMessage : undefined}
                  onUnpin={derived.canWriteChat ? handleUnpinMessage : undefined}
                  showReply={!derived.isChannel || (derived.canWriteChat ?? false)}
                  onForwardMessage={handleForwardMessage}
                  threadScrollKey={threadScrollKey}
                  initialScroll={initialScroll}
                  openPaintGeneration={openPaintGeneration}
                  threadLayoutSettling={isThreadOpenSettling || isSwitchingChatType || initialScroll === undefined}
                />
              </ChatAutoTranslateContext.Provider>
            </div>
          </div>
        </main>

        {effectiveFooterVariant != null &&
          !(contextType === 'GROUP' &&
            (panels.showParticipantsPage ||
              panels.showItemPage ||
              panels.isParticipantsPageAnimating ||
              panels.isItemPageAnimating)) && (
          <GameChatFooter visible variant={effectiveFooterVariant} />
        )}

        {contextType === 'GAME' && panels.showParticipantsModal && game && (
          <ChatParticipantsModal game={game} onClose={() => panels.setShowParticipantsModal(false)} currentChatType={currentChatType} />
        )}

        {contextType === 'USER' && (
          <PlayerCardBottomSheet
            playerId={panels.showPlayerCard && userChat && user?.id ? (userChat.user1Id === user.id ? userChat.user2Id : userChat.user1Id) ?? null : null}
            onClose={() => panels.setShowPlayerCard(false)}
          />
        )}

        {(contextType === 'GAME' || derived.isBugChat || contextType === 'GROUP') && (
          <ConfirmationModal
            isOpen={showLeaveConfirmation}
            title={contextType === 'GAME' ? leaveModalLabels.title : t('chat.leave')}
            message={contextType === 'GAME' ? leaveModalLabels.message : t('chat.leaveConfirmation')}
            confirmText={contextType === 'GAME' ? leaveModalLabels.confirmText : t('chat.leave')}
            cancelText={t('common.cancel')}
            confirmVariant="danger"
            onConfirm={handleLeaveChat}
            onClose={() => setShowLeaveConfirmation(false)}
          />
        )}
      </div>
    </SportLevelProvider>
  );
};
