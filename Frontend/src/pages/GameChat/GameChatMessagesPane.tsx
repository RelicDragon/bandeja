import React, { useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CHAT_PANE_SLIDE_OFFSET,
  CHAT_PANE_SLIDE_TRANSITION,
} from '@/components/chat/chatListMotion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MessageList } from '@/components/MessageList';
import { ChatAutoTranslateContext } from '@/contexts/ChatAutoTranslateContext';
import { useThreadChrome, useThreadMessageActions, useThreadMessagesData, useThreadScroll, useThreadSearch } from './useThreadView';
import { ThreadScrollTargetOverlay } from './ThreadScrollTargetOverlay';

/** Message list shell — subscribes to message data, actions, and scroll seams. */
export const GameChatMessagesPane: React.FC = () => {
  const {
    messages,
    hasMoreMessages,
    isLoadingMessages,
    isInitialLoad,
    isThreadOpenSettling,
    isLoadingMore,
    isSwitchingChatType,
  } = useThreadMessagesData();
  const {
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
  } = useThreadMessageActions();
  const {
    messageListRef,
    initialScroll,
    highlightAnchorMessageId,
    openPaintGeneration,
    threadScrollKey,
    setChatNearBottom,
    handleScrollToMessage,
  } = useThreadScroll();
  const {
    contextType,
    userChat,
    pinnedMessages,
    derived,
    panels,
    autoTranslateLanguageCodes,
    currentChatType,
    game,
    scrollTargetMessageId,
    handleScrollTargetReached,
    loadingScrollTargetId,
  } = useThreadChrome();
  const { threadSearchOutlineQuery } = useThreadSearch();

  const reduceMotion = usePrefersReducedMotion();
  const availableChatTypes = derived.availableChatTypes;
  const shouldAnimateChatTypeSwitch =
    contextType === 'GAME' && availableChatTypes.length > 1 && !reduceMotion;

  const prevChatTypeRef = useRef(currentChatType);
  const slideDirectionRef = useRef(0);
  if (currentChatType !== prevChatTypeRef.current) {
    const prevIdx = availableChatTypes.indexOf(prevChatTypeRef.current);
    const nextIdx = availableChatTypes.indexOf(currentChatType);
    if (prevIdx >= 0 && nextIdx >= 0 && prevIdx !== nextIdx) {
      slideDirectionRef.current = nextIdx > prevIdx ? 1 : -1;
    }
    prevChatTypeRef.current = currentChatType;
  }
  const slideDirection = slideDirectionRef.current;
  const enterX = slideDirection * CHAT_PANE_SLIDE_OFFSET;
  const exitX = -slideDirection * CHAT_PANE_SLIDE_OFFSET;

  const pinnedBarIds = useMemo(() => pinnedMessages.map((m) => m.id), [pinnedMessages]);
  const scrollTargetSessionActive = loadingScrollTargetId != null;
  const panelOverlayActive =
    panels.showParticipantsPage ||
    panels.showItemPage ||
    panels.isParticipantsPageAnimating ||
    panels.isItemPageAnimating;

  const tabMotionKey = threadScrollKey ?? 'thread-none';
  const canMutateMessages = derived.canWriteChat;
  const messageList = (
    <MessageList
      ref={messageListRef}
      messages={messages}
      onChatScrollNearBottomChange={setChatNearBottom}
      onAddReaction={canMutateMessages ? handleAddReaction : undefined}
      onRemoveReaction={canMutateMessages ? handleRemoveReaction : undefined}
      onDeleteMessage={canMutateMessages ? handleDeleteMessage : undefined}
      onReplyMessage={canMutateMessages ? handleReplyMessage : undefined}
      onEditMessage={canMutateMessages ? handleEditMessage : undefined}
      onPollUpdated={canMutateMessages ? handlePollUpdated : undefined}
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
      hasContextPanel={derived.isBugChat || derived.isItemChat}
      pinnedMessageIds={pinnedBarIds}
      onPin={derived.canWriteChat ? handlePinMessage : undefined}
      onUnpin={derived.canWriteChat ? handleUnpinMessage : undefined}
      showReply={!derived.isChannel || (derived.canWriteChat ?? false)}
      onForwardMessage={handleForwardMessage}
      threadScrollKey={threadScrollKey}
      initialScroll={initialScroll}
      highlightAnchorMessageId={highlightAnchorMessageId}
      openPaintGeneration={openPaintGeneration}
      threadLayoutSettling={isThreadOpenSettling || isSwitchingChatType || initialScroll === undefined}
      scrollTargetMessageId={scrollTargetMessageId}
      loadingScrollTargetId={loadingScrollTargetId}
      onScrollTargetReached={handleScrollTargetReached}
      threadSearchOutlineQuery={threadSearchOutlineQuery}
      entityType={contextType === 'GAME' ? game?.entityType : undefined}
    />
  );

  const messageListWithScrollOverlay = (
    <div className="relative flex flex-1 flex-col min-h-0">
      <div
        className={`flex flex-1 flex-col min-h-0 transition-opacity duration-200 ${
          scrollTargetSessionActive ? 'pointer-events-none opacity-35' : 'opacity-100'
        }`}
      >
        {messageList}
      </div>
      <ThreadScrollTargetOverlay active={scrollTargetSessionActive} />
    </div>
  );

  return (
    <motion.div
      className="flex-1 flex flex-col min-h-0"
      animate={{
        opacity: panelOverlayActive ? 0 : 1,
        x: reduceMotion ? 0 : panelOverlayActive ? '-100%' : 0,
      }}
      transition={reduceMotion ? { duration: 0 } : CHAT_PANE_SLIDE_TRANSITION}
    >
      <ChatAutoTranslateContext.Provider value={autoTranslateLanguageCodes}>
        {shouldAnimateChatTypeSwitch ? (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tabMotionKey}
              className="flex-1 flex flex-col min-h-0"
              initial={{ opacity: 0, x: enterX }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: exitX }}
              transition={CHAT_PANE_SLIDE_TRANSITION}
            >
              {messageListWithScrollOverlay}
            </motion.div>
          </AnimatePresence>
        ) : (
          messageListWithScrollOverlay
        )}
      </ChatAutoTranslateContext.Provider>
    </motion.div>
  );
};
