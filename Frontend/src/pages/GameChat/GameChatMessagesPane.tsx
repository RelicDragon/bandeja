import React, { useMemo } from 'react';
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
  } = useThreadChrome();

  const pinnedBarIds = useMemo(() => pinnedMessages.map((m) => m.id), [pinnedMessages]);
  const panelOverlayActive =
    panels.showParticipantsPage ||
    panels.showItemPage ||
    panels.isParticipantsPageAnimating ||
    panels.isItemPageAnimating;

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${
        panelOverlayActive
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
  );
};
