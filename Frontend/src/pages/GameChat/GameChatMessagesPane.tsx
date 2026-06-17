import React, { useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CHAT_PANE_SLIDE_OFFSET,
  CHAT_PANE_SLIDE_TRANSITION,
} from '@/components/chat/chatListMotion';
import { MessageList } from '@/components/MessageList';
import { ChatAutoTranslateContext } from '@/contexts/ChatAutoTranslateContext';
import {
  useThreadChrome,
  useThreadMessageActions,
  useThreadMessagesData,
  useThreadScroll,
} from './useThreadView';

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
  } = useThreadChrome();

  const reduceMotion = useReducedMotion();
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
  const panelOverlayActive =
    panels.showParticipantsPage ||
    panels.showItemPage ||
    panels.isParticipantsPageAnimating ||
    panels.isItemPageAnimating;

  const tabMotionKey = threadScrollKey ?? 'thread-none';
  const messageList = (
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
      highlightAnchorMessageId={highlightAnchorMessageId}
      openPaintGeneration={openPaintGeneration}
      threadLayoutSettling={isThreadOpenSettling || isSwitchingChatType || initialScroll === undefined}
    />
  );

  return (
    <motion.div
      className="flex-1 flex flex-col min-h-0"
      animate={{
        opacity: panelOverlayActive ? 0 : 1,
        x: panelOverlayActive ? '-100%' : 0,
      }}
      transition={CHAT_PANE_SLIDE_TRANSITION}
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
              {messageList}
            </motion.div>
          </AnimatePresence>
        ) : (
          messageList
        )}
      </ChatAutoTranslateContext.Provider>
    </motion.div>
  );
};
