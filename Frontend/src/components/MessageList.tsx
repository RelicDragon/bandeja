import { useEffect, useMemo, forwardRef, memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageListRow } from './MessageList/MessageListRow';
import { messageListPropsEqual } from './MessageList/messageListPropsEqual';
import { resetMessageListContextMenu } from './MessageList/messageListContextMenuStore';
import { useMessageListNewKeys } from './MessageList/useMessageListNewKeys';
import { useMessageListSeenDateSeparators } from './MessageList/useMessageListSeenDateSeparators';
import { ThreadScrollViewport } from './MessageList/ThreadScrollViewport';
import type { MessageListHandle, MessageListProps } from './MessageList/types';
import { buildReplyCountMap, findFirstReplyId } from '@/services/chat/replyCountMap';
import { getMessageRowKey } from '@/services/chat/messageRowKey';
import { isThreadMessagesPending } from '@/pages/GameChat/threadViewLoadingState';
import { WavyDots } from '@/components/WavyDots';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CHAT_MESSAGE_ENTER_Y,
  CHAT_PANEL_TRANSITION,
} from '@/components/chat/chatListMotion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getChatDateSeparatorLabel } from '@/utils/chatDateSeparator';

export type { MessageListHandle, MessageListProps };

const MessageListInner = forwardRef<MessageListHandle, MessageListProps>(function MessageList(
  {
    messages,
    onAddReaction,
    onRemoveReaction,
    onDeleteMessage,
    onReplyMessage,
    onEditMessage,
    onPollUpdated,
    onResendQueued,
    onRemoveFromQueue,
    isLoading = false,
    isLoadingMessages = false,
    isSwitchingChatType = false,
    onScrollToMessage,
    hasMoreMessages = false,
    onLoadMore,
    isInitialLoad = false,
    isLoadingMore = false,
    isChannel = false,
    userChatUser1Id,
    userChatUser2Id,
    onChatRequestRespond,
    hasContextPanel = false,
    pinnedMessageIds = [],
    onPin,
    onUnpin,
    showReply = true,
    onForwardMessage,
    threadScrollKey = null,
    initialScroll = undefined,
    highlightAnchorMessageId,
    openPaintGeneration = 0,
    threadLayoutSettling = false,
    onChatScrollNearBottomChange,
    scrollTargetMessageId = null,
    entityType,
  },
  ref
) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    resetMessageListContextMenu();
  }, [threadScrollKey]);

  const replyCountMap = useMemo(() => buildReplyCountMap(messages), [messages]);

  const onScrollToFirstReply = useCallback((parentMessageId: string) => {
    const firstId = findFirstReplyId(messagesRef.current, parentMessageId);
    if (firstId) onScrollToMessage?.(firstId);
  }, [onScrollToMessage]);

  const rowHandlers = useMemo(
    () => ({
      onAddReaction,
      onRemoveReaction,
      onDeleteMessage,
      onReplyMessage,
      onEditMessage,
      onPollUpdated,
      onResendQueued,
      onRemoveFromQueue,
      onScrollToMessage,
      isChannel,
      userChatUser1Id,
      userChatUser2Id,
      onChatRequestRespond,
      onPin,
      onUnpin,
      showReply,
      onForwardMessage,
    }),
    [
      onAddReaction,
      onRemoveReaction,
      onDeleteMessage,
      onReplyMessage,
      onEditMessage,
      onPollUpdated,
      onResendQueued,
      onRemoveFromQueue,
      onScrollToMessage,
      isChannel,
      userChatUser1Id,
      userChatUser2Id,
      onChatRequestRespond,
      onPin,
      onUnpin,
      showReply,
      onForwardMessage,
    ]
  );

  const isMessagesPending = isThreadMessagesPending(isLoadingMessages, isInitialLoad);
  const messageRowKeys = useMemo(
    () => messages.map((m) => getMessageRowKey(m)),
    [messages]
  );
  const newMessageKeys = useMessageListNewKeys(messageRowKeys, threadScrollKey ?? undefined);
  const consumeDateSeparatorFade = useMessageListSeenDateSeparators(threadScrollKey ?? undefined);
  const newKeyStaggerIndex = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const key of messageRowKeys) {
      if (newMessageKeys.has(key)) map.set(key, i++);
    }
    return map;
  }, [messageRowKeys, newMessageKeys]);

  const showLoading = messages.length === 0 && isMessagesPending;
  const showEmpty = messages.length === 0 && !isMessagesPending;
  const showMessages = messages.length > 0;
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;

  const emptyStateContent = (
    <div className="text-center">
      <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-8 h-8 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('chat.messages.noMessages')}</h3>
    </div>
  );

  const threadStatusLayer = reduceMotion ? (
    showLoading ? (
      <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label={t('common.loading')}>
        <WavyDots />
      </div>
    ) : showEmpty ? (
      <div className="absolute inset-0 flex items-center justify-center">{emptyStateContent}</div>
    ) : null
  ) : (
    <AnimatePresence mode="wait" initial={false}>
      {showLoading ? (
        <motion.div
          key="thread-loading"
          className="absolute inset-0 z-[3] flex items-center justify-center bg-gray-50 dark:bg-gray-800 pointer-events-none"
          initial={{ opacity: 0, y: CHAT_MESSAGE_ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -CHAT_MESSAGE_ENTER_Y }}
          transition={panelTransition}
          role="status"
          aria-label={t('common.loading')}
        >
          <WavyDots />
        </motion.div>
      ) : showEmpty ? (
        <motion.div
          key="thread-empty"
          className="absolute inset-0 z-[3] flex items-center justify-center bg-gray-50 dark:bg-gray-800 pointer-events-none"
          initial={{ opacity: 0, y: CHAT_MESSAGE_ENTER_Y, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -CHAT_MESSAGE_ENTER_Y }}
          transition={panelTransition}
        >
          {emptyStateContent}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="relative flex-1 min-h-0 bg-gray-50 dark:bg-gray-800">
      {showMessages ? (
        <ThreadScrollViewport
          ref={ref}
          messages={messages}
          threadScrollKey={threadScrollKey}
          initialScroll={initialScroll}
          highlightAnchorMessageId={highlightAnchorMessageId}
          openPaintGeneration={openPaintGeneration}
          threadLayoutSettling={threadLayoutSettling}
          onChatScrollNearBottomChange={onChatScrollNearBottomChange}
          hasMoreMessages={hasMoreMessages}
          onLoadMore={onLoadMore}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          isInitialLoad={isInitialLoad}
          isLoadingMessages={isLoadingMessages}
          isSwitchingChatType={isSwitchingChatType}
          scrollTargetMessageId={scrollTargetMessageId}
          hasContextPanel={hasContextPanel}
          reduceMotion={reduceMotion}
        >
          {(ctx) =>
            ctx.virtualItems.map((row) => {
              const message = row.index < messages.length ? messages[row.index] : undefined;
              const rowKey = message ? getMessageRowKey(message) : String(row.key);
              const dateSeparatorLabel = message
                ? getChatDateSeparatorLabel(messages, row.index)
                : null;
              return (
                <MessageListRow
                  key={row.key}
                  row={row}
                  rowStyle={ctx.rowStyles.get(String(row.key)) ?? { transform: `translateY(${row.start}px)` }}
                  message={message}
                  messages={messages}
                  rowCount={ctx.rowCount}
                  measureElement={ctx.measureElement}
                  eagerMediaMessageIds={ctx.eagerMediaMessageIds}
                  replyCount={message ? (replyCountMap.get(message.id) ?? 0) : 0}
                  isPinned={message ? pinnedSet.has(message.id) : false}
                  isNew={message ? newMessageKeys.has(rowKey) : false}
                  staggerIndex={message ? (newKeyStaggerIndex.get(rowKey) ?? 0) : 0}
                  fadeDateSeparator={
                    dateSeparatorLabel ? consumeDateSeparatorFade(dateSeparatorLabel) : false
                  }
                  onScrollToFirstReply={onScrollToFirstReply}
                  handlers={rowHandlers}
                  entityType={entityType}
                />
              );
            })
          }
        </ThreadScrollViewport>
        ) : null}
      {threadStatusLayer}
    </div>
  );
});

export const MessageList = memo(MessageListInner, messageListPropsEqual);
