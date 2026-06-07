import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/api/chat';
import { MessageList } from '@/components/MessageList';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { MarketItemPanel } from '@/components/marketplace';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameChatProps } from './GameChat/types';
import { GameChatHeader } from './GameChat/GameChatHeader';
import { GameChatTabs } from './GameChat/GameChatTabs';
import { GameChatFooter } from './GameChat/GameChatFooter';
import { GameChatAccessDenied } from './GameChat/GameChatAccessDenied';
import { ThreadViewProvider } from './GameChat/ThreadViewProvider';
import { useThreadView } from './GameChat/useThreadView';
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
  const location = useLocation();
  const { user } = useAuthStore();
  const { setBottomTabsVisible } = useNavigationStore();
  const view = useThreadView();
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
    loadMessages,
    messages,
    messageListRef,
    hasMoreMessages,
    isLoadingMessages,
    isInitialLoad,
    isThreadOpenSettling,
    isLoadingMore,
    isSwitchingChatType,
    loadMoreMessages,
    initialScroll,
    openPaintGeneration,
    threadScrollKey,
    handleAddReaction,
    handleRemoveReaction,
    handleDeleteMessage,
    handleReplyMessage,
    handleEditMessage,
    handlePollUpdated,
    handleResendQueued,
    handleRemoveFromQueue,
    handleScrollToMessage,
    setChatNearBottom,
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
    derived,
    footerVariant,
    title,
    titleContent,
    titleMetaRow,
    subtitle,
    icon,
    panels,
    failedMutationCount,
    retryMutations,
    autoTranslateLanguageCodes,
    handleToggleMute,
    handleLeaveChat,
    handleJoinChannel,
    handleChatTypeChange,
    leaveModalLabels,
    isMuted,
    isTogglingMute,
    showLeaveConfirmation,
    setShowLeaveConfirmation,
    chatContainerRef,
    showLoadingHeader,
    navigate,
    currentChatType,
    handleForwardMessage,
    handleChatRequestRespond,
  } = view;

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => setBottomTabsVisible(true);
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(panels.handleBackButton);

  const routeGameId = useMemo(() => {
    const m = location.pathname.match(/^\/games\/([^/]+)/);
    return m?.[1];
  }, [location.pathname]);

  const isGameDetailsSideChat = useMemo(
    () =>
      isEmbedded &&
      contextType === 'GAME' &&
      !!id &&
      routeGameId === id &&
      !location.pathname.includes('/chat'),
    [isEmbedded, contextType, id, routeGameId, location.pathname]
  );

  const isGameTitleNavToGame = useMemo(
    () => contextType === 'GAME' && !!id && !isGameDetailsSideChat,
    [contextType, id, isGameDetailsSideChat]
  );

  const isTitleClickable = useMemo(
    () =>
      !!(contextType === 'USER' && userChat && user?.id) ||
      contextType === 'GROUP' ||
      isGameTitleNavToGame,
    [contextType, userChat, user?.id, isGameTitleNavToGame]
  );

  const handleTitleClick = useCallback(() => {
    if (isGameTitleNavToGame && id) {
      navigate(`/games/${id}`);
      return;
    }
    panels.handleTitleClick();
  }, [isGameTitleNavToGame, id, navigate, panels]);

  const pinnedBarSkipAnimationRef = useRef(true);
  useEffect(() => {
    pinnedBarSkipAnimationRef.current = true;
  }, [threadScrollKey]);
  useEffect(() => {
    if (pinnedMessagesOrdered.length > 0 && pinnedBarSkipAnimationRef.current) {
      pinnedBarSkipAnimationRef.current = false;
    }
  }, [pinnedMessagesOrdered.length, threadScrollKey]);
  const pinnedBarAnimate = !pinnedBarSkipAnimationRef.current;

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
        <GameChatHeader
          isEmbedded={isEmbedded}
          showLoadingHeader={showLoadingHeader}
          contextType={contextType}
          isBugChat={derived.isBugChat}
          title={title}
          titleContent={titleContent}
          titleMetaRow={titleMetaRow}
          subtitle={subtitle}
          icon={icon}
          onBack={panels.handleHeaderBack}
          showPanelBack={contextType === 'GROUP' && (panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating)}
          onPanelBack={panels.handlePanelBack}
          isTitleClickable={isTitleClickable}
          onTitleClick={handleTitleClick}
          showHeaderActions={derived.showHeaderActions}
          headerActions={derived.showHeaderActions ? {
            showMute: derived.showMute,
            showLeave: derived.showLeave,
            showParticipantsButton: contextType === 'GAME',
            isMuted,
            isTogglingMute,
            onToggleMute: handleToggleMute,
            onLeaveClick: () => setShowLeaveConfirmation(true),
            leaveTitle: derived.leaveTitle,
            game,
            onParticipantsClick: () => panels.setShowParticipantsModal(true),
          } : null}
        />

        {!showLoadingHeader && failedMutationCount > 0 && (
          <button
            type="button"
            onClick={() => retryMutations()}
            className="w-full text-center text-sm py-2 px-3 bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-b border-amber-200 dark:border-amber-800"
          >
            {t('chat.mutationsSyncFailed', { defaultValue: 'Some actions did not sync. Tap to retry.' })}
          </button>
        )}

        {!showLoadingHeader && contextType === 'GAME' && ((derived.isParticipant && derived.isPlayingParticipant) || derived.isAdminOrOwner || (game?.status && game.status !== 'ANNOUNCED')) && (
          <GameChatTabs
            availableChatTypes={derived.availableChatTypes}
            currentChatType={currentChatType}
            isSwitchingChatType={isSwitchingChatType}
            onChatTypeChange={handleChatTypeChange}
          />
        )}

        <AnimatePresence>
          {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && (
            <motion.div
              key="pinned-bar"
              initial={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : false}
              animate={{ opacity: 1, maxHeight: pinnedBarAnimate ? 80 : undefined }}
              exit={pinnedBarAnimate ? { opacity: 0, maxHeight: 0 } : undefined}
              transition={pinnedBarAnimate ? { duration: 0.25, ease: 'easeInOut' } : { duration: 0 }}
              className="overflow-hidden"
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

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative transition-opacity duration-150">
          <AnimatePresence>
            {!showLoadingHeader && pinnedMessagesOrdered.length > 0 && !panels.showParticipantsPage && !panels.showItemPage && (
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
            className={`flex-1 flex flex-col min-h-0 transition-all duration-300 ease-in-out ${
              panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'
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
                isLoadingMessages={isLoadingMessages && !isEmbedded}
                isSwitchingChatType={isSwitchingChatType}
                onScrollToMessage={handleScrollToMessage}
                hasMoreMessages={hasMoreMessages}
                onLoadMore={loadMoreMessages}
                isInitialLoad={isInitialLoad && !isEmbedded}
                isLoadingMore={isLoadingMore}
                isChannel={derived.isChannel}
                userChatUser1Id={contextType === 'USER' && userChat ? userChat.user1Id : undefined}
                userChatUser2Id={contextType === 'USER' && userChat ? userChat.user2Id : undefined}
                onChatRequestRespond={handleChatRequestRespond}
                hasContextPanel={!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage}
                pinnedMessageIds={pinnedMessages.map((m) => m.id)}
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
        </main>

        {((!isInitialLoad || isEmbedded || (isEmbedded && messages.length > 0)) ||
          footerVariant?.type === 'contextLoading') &&
          footerVariant != null &&
          !(contextType === 'GROUP' &&
            (panels.showParticipantsPage ||
              panels.showItemPage ||
              panels.isParticipantsPageAnimating ||
              panels.isItemPageAnimating)) && (
          <GameChatFooter visible variant={footerVariant} />
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
