import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { chatApi } from '@/api/chat';
import { ChatType } from '@/types';
import { MessageList } from '@/components/MessageList';
import { ChatParticipantsModal } from '@/components/ChatParticipantsModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { normalizeChatType } from '@/utils/chatType';
import { GroupChannelSettings } from '@/components/chat/GroupChannelSettings';
import { ChatContextPanel } from '@/components/chat/contextPanels';
import { PinnedMessagesBar } from '@/components/chat/PinnedMessagesBar';
import { MarketItemPanel } from '@/components/marketplace';
import { PlayerCardBottomSheet } from '@/components/PlayerCardBottomSheet';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import { cancelAllForContext } from '@/services/chatSendService';
import { isCapacitor } from '@/utils/capacitor';
import { AnimatePresence, motion } from 'framer-motion';
import type { LocationState, GameChatProps } from './GameChat/types';
import { getContextTypeFromRoute } from './GameChat/types';
import { GameChatHeader } from './GameChat/GameChatHeader';
import { GameChatTabs } from './GameChat/GameChatTabs';
import { GameChatFooter } from './GameChat/GameChatFooter';
import { GameChatLoadingSkeleton } from './GameChat/GameChatLoadingSkeleton';
import { GameChatAccessDenied } from './GameChat/GameChatAccessDenied';
import { useGameChatPinned } from './GameChat/useGameChatPinned';
import { useGameChatContext } from './GameChat/useGameChatContext';
import { useGameChatMessages } from './GameChat/useGameChatMessages';
import { useGameChatActions } from './GameChat/useGameChatActions';
import { useGameChatOptimistic } from './GameChat/useGameChatOptimistic';
import { useGameChatSocket } from './GameChat/useGameChatSocket';
import { useKeyboardHeight } from './GameChat/useKeyboardHeight';
import { useGameChatDisplay } from './GameChat/useGameChatDisplay';
import { useGameChatReactions } from './GameChat/useGameChatReactions';
import { useGameChatDerived } from './GameChat/useGameChatDerived';
import { useGameChatPanels } from './GameChat/useGameChatPanels';
import { useGameChatInitialLoad } from './GameChat/useGameChatInitialLoad';
import { useGameChatFooterVariant } from './GameChat/useGameChatFooterVariant';

export const GameChat: React.FC<GameChatProps> = ({ isEmbedded = false, chatId: propChatId, chatType: propChatType }) => {
  const { t } = useTranslation();
  const { id: paramId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { setBottomTabsVisible, setChatsFilter } = useNavigationStore();

  const id = isEmbedded ? propChatId : paramId;
  const locationState = location.state as LocationState | null;
  const contextType = getContextTypeFromRoute(location.pathname, locationState, isEmbedded, propChatType);
  const initialChatType = locationState?.initialChatType;

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const previousIdRef = useRef<string | undefined>(undefined);
  const currentIdRef = useRef<string | undefined>(id);
  currentIdRef.current = id;

  const {
    game,
    setGame,
    bug,
    setBug,
    userChat,
    setUserChat,
    groupChannel,
    setGroupChannel,
    groupChannelParticipantsCount,
    setGroupChannelParticipantsCount,
    isLoadingContext,
    setIsLoadingContext,
    loadContext,
  } = useGameChatContext({
    id,
    contextType,
    isEmbedded,
    initialUserChat: locationState?.chat ?? null,
    locationPathname: location.pathname,
    navigate,
    setChatsFilter,
    currentIdRef,
  });

  const [currentChatType, setCurrentChatType] = useState<ChatType>(initialChatType || 'PUBLIC');
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false);
  const [isLeavingChat, setIsLeavingChat] = useState(false);
  const [isJoiningAsGuest, setIsJoiningAsGuest] = useState(false);
  const [isBlockedByUser, setIsBlockedByUser] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [translateToLanguageForChat, setTranslateToLanguageForChat] = useState<string | null>(null);
  const [hasSetDefaultChatType, setHasSetDefaultChatType] = useState(false);

  const effectiveChatType = useMemo(
    () => (contextType === 'GAME' ? normalizeChatType(currentChatType) : 'PUBLIC') as ChatType,
    [contextType, currentChatType]
  );

  const {
    messages,
    setMessages,
    messagesRef,
    setPage,
    hasMoreMessages,
    setHasMoreMessages,
    isLoadingMessages,
    setIsLoadingMessages,
    isInitialLoad,
    setIsInitialLoad,
    isLoadingMore,
    isSwitchingChatType,
    setIsSwitchingChatType,
    justLoadedOlderMessagesRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    scrollToBottom,
    loadMessages,
    loadMoreMessages,
    loadMessagesBeforeMessageId,
  } = useGameChatMessages({
    id,
    contextType,
    currentChatType,
    effectiveChatType,
    isEmbedded,
    chatContainerRef,
    currentIdRef,
  });

  const derived = useGameChatDerived({
    game,
    groupChannel,
    user,
    contextType,
    currentChatType,
    messages,
  });

  const panels = useGameChatPanels({
    contextType,
    userChat,
    userId: user?.id,
    isItemChat: derived.isItemChat,
    navigate,
  });

  const {
    handleAddOptimisticMessage,
    handleMarkFailed,
    handleSendQueued,
    handleResendQueued,
    handleRemoveFromQueue,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    handleNewMessage,
    handleNewMessageRef,
  } = useGameChatOptimistic({
    id,
    contextType,
    currentChatType,
    user,
    setMessages,
    messagesRef,
    scrollToBottom,
    setUserChat,
  });

  const {
    replyTo,
    editingMessage,
    setReplyTo,
    setEditingMessage,
    handleAddReaction,
    handleRemoveReaction,
    handlePollUpdated,
    handleDeleteMessage,
    handleReplyMessage,
    handleCancelReply,
    handleEditMessage,
    handleCancelEdit,
    handleMessageUpdated,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    handleChatRequestRespond,
  } = useGameChatReactions({ id, user, setMessages, messagesRef, setUserChat });

  const {
    pinnedMessages,
    pinnedMessagesOrdered,
    pinnedBarTopIndex,
    loadingScrollTargetId,
    fetchPinnedMessages,
    handleScrollToMessage,
    handlePinnedBarClick,
    handlePinMessage,
    handleUnpinMessage,
  } = useGameChatPinned({
    id,
    contextType,
    effectiveChatType,
    canAccessChat: !!derived.canAccessChat,
    chatContainerRef,
    loadMessagesBeforeMessageId,
    messagesRef,
  });

  const {
    leaveModalLabels,
    handleJoinAsGuest,
    handleLeaveChat,
    handleToggleMute,
    handleJoinChannel,
    handleChatTypeChange,
  } = useGameChatActions({
    id,
    contextType,
    loadContext,
    navigate,
    setChatsFilter,
    setGame,
    setGroupChannel,
    groupChannel,
    userParticipant: derived.userParticipant,
    currentChatType,
    setCurrentChatType,
    setPage,
    setHasMoreMessages,
    setMessages,
    messagesRef,
    setIsSwitchingChatType,
    setIsLoadingMessages,
    setIsInitialLoad,
    handleMarkFailed,
    handleNewMessageRef,
    scrollToBottom,
    user,
    isLeavingChat,
    setIsLeavingChat,
    setShowLeaveConfirmation,
    setIsJoiningAsGuest,
    setIsMuted,
    setIsTogglingMute,
    isMuted,
  });

  useGameChatSocket({
    id,
    contextType,
    userId: user?.id,
    setMessages,
    messagesRef,
    scrollToBottom,
    justLoadedOlderMessagesRef,
    handleNewMessage,
    handleMessageReaction,
    handleReadReceipt,
    handleMessageDeleted,
    fetchPinnedMessages,
    handleMessageUpdated,
    isLoadingMessages,
    isSwitchingChatType,
    isLoadingMore,
    isInitialLoad,
    messagesLength: messages.length,
  });

  const keyboardHeight = useKeyboardHeight();

  const displaySettings = user ? resolveDisplaySettings(user) : resolveDisplaySettings(null);
  const { title, subtitle, icon } = useGameChatDisplay({
    contextType,
    game,
    bug,
    userChat,
    groupChannel,
    groupChannelParticipantsCount,
    isBugChat: derived.isBugChat,
    isItemChat: derived.isItemChat,
    userId: user?.id,
    displaySettings,
    onOpenItemPage: panels.onOpenItemPage,
    onOpenParticipantsPage: panels.onOpenParticipantsPage,
  });

  useEffect(() => {
    if (!isEmbedded) {
      setBottomTabsVisible(false);
      return () => setBottomTabsVisible(true);
    }
  }, [setBottomTabsVisible, isEmbedded]);

  useBackButtonHandler(panels.handleBackButton);

  useGameChatInitialLoad({
    id,
    user,
    contextType,
    initialChatType,
    currentChatType,
    hasSetDefaultChatType,
    loadContext,
    loadMessages,
    userChat,
    handleMarkFailed,
    handleNewMessageRef,
    loadingIdRef,
    hasLoadedRef,
    isLoadingRef,
    messagesRef,
    setMessages,
    setCurrentChatType,
    setIsBlockedByUser,
    setIsMuted,
    setTranslateToLanguageForChat,
    setHasSetDefaultChatType,
    setIsInitialLoad,
    setIsLoadingMessages,
  });

  useEffect(() => {
    if (id !== previousIdRef.current) {
      const prevId = previousIdRef.current;
      if (prevId) cancelAllForContext(contextType, prevId);
      setGame(null);
      setBug(null);
      setUserChat(null);
      setGroupChannel(null);
      setGroupChannelParticipantsCount(0);
      setMessages([]);
      messagesRef.current = [];
      setPage(1);
      setHasMoreMessages(true);
      setIsLoadingMessages(true);
      setIsInitialLoad(true);
      if (!isEmbedded) setIsLoadingContext(true);
      setIsBlockedByUser(false);
      setIsMuted(false);
      setReplyTo(null);
      setEditingMessage(null);
      setCurrentChatType(initialChatType || 'PUBLIC');
      setHasSetDefaultChatType(false);
      previousIdRef.current = id;
    }
  }, [id, isEmbedded, contextType, initialChatType, setGame, setBug, setUserChat, setGroupChannel, setGroupChannelParticipantsCount, setIsLoadingContext, setMessages, messagesRef, setPage, setHasMoreMessages, setIsLoadingMessages, setIsInitialLoad, setReplyTo, setEditingMessage]);

  useEffect(() => {
    if (locationState?.forceReload) {
      hasLoadedRef.current = false;
      loadingIdRef.current = undefined;
    }
  }, [locationState?.forceReload, hasLoadedRef, loadingIdRef]);

  const footerVariant = useGameChatFooterVariant({
    id,
    contextType,
    isBlockedByUser,
    userChat,
    userId: user?.id,
    messagesLength: messages.length,
    canAccessChat: !!derived.canAccessChat,
    canWriteChat: !!derived.canWriteChat,
    isChannelParticipantOnly: !!derived.isChannelParticipantOnly,
    game,
    bug,
    groupChannel,
    isInJoinQueue: !!derived.isInJoinQueue,
    isChannelParticipant: !!derived.isChannelParticipant,
    isPlayingParticipant: !!derived.isPlayingParticipant,
    isAdminOrOwner: !!derived.isAdminOrOwner,
    isChannel: !!derived.isChannel,
    isJoiningAsGuest,
    currentChatType,
    translateToLanguageForChat,
    setUserChat,
    setTranslateToLanguageForChat,
    loadContext,
    handleAddOptimisticMessage,
    handleSendQueued: handleSendQueued as (params: any) => void,
    handleSendFailed,
    handleReplaceOptimisticWithServerMessage,
    replyTo,
    handleCancelReply,
    editingMessage,
    handleCancelEdit,
    handleMessageUpdated,
    lastOwnMessage: derived.lastOwnMessage,
    handleEditMessage,
    handleScrollToMessage,
    handleJoinAsGuest,
  });

  if (isLoadingContext && !isEmbedded) {
    return (
      <GameChatLoadingSkeleton
        onBack={() => handleBack(navigate)}
        contextType={contextType}
        onAddReaction={handleAddReaction}
        onRemoveReaction={handleRemoveReaction}
        onDeleteMessage={handleDeleteMessage}
        onReplyMessage={handleReplyMessage}
        onPollUpdated={handlePollUpdated}
        onScrollToMessage={handleScrollToMessage}
        onLoadMore={loadMoreMessages}
      />
    );
  }

  if (!derived.canViewPublicChat) {
    return <GameChatAccessDenied id={id} navigate={navigate} />;
  }

  const showLoadingHeader = isEmbedded && isLoadingContext;

  return (
    <>
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
          subtitle={subtitle ?? null}
          icon={icon}
          onBack={panels.handleHeaderBack}
          showPanelBack={contextType === 'GROUP' && (panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating)}
          onPanelBack={panels.handlePanelBack}
          isTitleClickable={!!(contextType === 'USER' && userChat && user?.id) || contextType === 'GROUP'}
          onTitleClick={panels.handleTitleClick}
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
              initial={{ opacity: 0, maxHeight: 0 }}
              animate={{ opacity: 1, maxHeight: 80 }}
              exit={{ opacity: 0, maxHeight: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
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

        <main
          className="flex-1 flex flex-col min-h-0 overflow-hidden overflow-x-hidden relative transition-all duration-300"
          style={{ marginBottom: isCapacitor() && keyboardHeight > 0 ? `${keyboardHeight}px` : '0px' }}
        >
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
              canEditBug={derived.isBugAdmin}
              onUpdate={() => id && loadContext().then(() => loadMessages())}
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
                onItemUpdate={() => id && loadContext().then(() => loadMessages())}
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
            <MessageList
              messages={messages}
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
              disableReadTracking={contextType === 'USER'}
              isChannel={derived.isChannel}
              userChatUser1Id={contextType === 'USER' && userChat ? userChat.user1Id : undefined}
              userChatUser2Id={contextType === 'USER' && userChat ? userChat.user2Id : undefined}
              onChatRequestRespond={handleChatRequestRespond}
              hasContextPanel={!showLoadingHeader && !panels.showParticipantsPage && !panels.showItemPage}
              pinnedMessageIds={pinnedMessages.map(m => m.id)}
              onPin={derived.canWriteChat ? handlePinMessage : undefined}
              onUnpin={derived.canWriteChat ? handleUnpinMessage : undefined}
            />
          </div>
        </main>

        {(!isInitialLoad || isEmbedded) && !(contextType === 'GROUP' && (panels.showParticipantsPage || panels.showItemPage || panels.isParticipantsPageAnimating || panels.isItemPageAnimating)) && (
          <GameChatFooter visible keyboardHeight={keyboardHeight} variant={footerVariant} />
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
    </>
  );
};
