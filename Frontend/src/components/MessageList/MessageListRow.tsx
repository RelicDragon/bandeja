import { memo } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import { AnimatedMessageItem } from '@/components/AnimatedMessageItem';
import { getChatDateSeparatorLabel } from '@/utils/chatDateSeparator';
import { getMessageGroupPosition } from '@/utils/chatMessageGrouping';
import type { MessageListProps } from './types';

type VirtualRowStyle = { transform: string; transition?: string };

type MessageListRowProps = {
  row: VirtualItem;
  rowStyle: VirtualRowStyle;
  message?: ChatMessage;
  messages: ChatMessage[];
  rowCount: number;
  measureElement: (node: Element | null) => void;
  eagerMediaMessageIds: Set<string>;
  replyCount: number;
  isPinned: boolean;
  isNew: boolean;
  staggerIndex: number;
  fadeDateSeparator?: boolean;
  onScrollToFirstReply: (parentMessageId: string) => void;
  handlers: Pick<
    MessageListProps,
    | 'onAddReaction'
    | 'onRemoveReaction'
    | 'onDeleteMessage'
    | 'onReplyMessage'
    | 'onEditMessage'
    | 'onPollUpdated'
    | 'onResendQueued'
    | 'onRemoveFromQueue'
    | 'onScrollToMessage'
    | 'isChannel'
    | 'userChatUser1Id'
    | 'userChatUser2Id'
    | 'onChatRequestRespond'
    | 'onPin'
    | 'onUnpin'
    | 'showReply'
    | 'onForwardMessage'
  >;
};

export const MessageListRow = memo(function MessageListRow({
  row,
  rowStyle,
  message,
  messages,
  rowCount,
  measureElement,
  eagerMediaMessageIds,
  replyCount,
  isPinned,
  isNew,
  staggerIndex,
  fadeDateSeparator = false,
  onScrollToFirstReply,
  handlers,
}: MessageListRowProps) {
  if (row.index === rowCount - 1) {
    return (
      <div
        key={row.key}
        data-index={row.index}
        ref={measureElement}
        className="absolute left-0 top-0 w-full will-change-transform"
        style={rowStyle}
        aria-hidden
      >
        <div className="h-32" />
      </div>
    );
  }

  if (!message) return null;

  const dateSeparatorLabel = getChatDateSeparatorLabel(messages, row.index);
  const groupPosition = getMessageGroupPosition(messages, row.index);

  return (
    <div
      key={row.key}
      data-index={row.index}
      ref={measureElement}
      id={`message-${message.id}`}
      className="absolute left-0 top-0 w-full will-change-transform"
      style={rowStyle}
    >
      <AnimatedMessageItem
        message={message}
        isNew={isNew}
        staggerIndex={staggerIndex}
        dateSeparatorLabel={dateSeparatorLabel ?? undefined}
        fadeDateSeparator={fadeDateSeparator}
        loadMediaEager={eagerMediaMessageIds.has(message.id)}
        groupPosition={groupPosition}
        onAddReaction={handlers.onAddReaction}
        onRemoveReaction={handlers.onRemoveReaction}
        onDeleteMessage={handlers.onDeleteMessage}
        onReplyMessage={handlers.onReplyMessage}
        onEditMessage={handlers.onEditMessage}
        onPollUpdated={handlers.onPollUpdated}
        onResendQueued={handlers.onResendQueued}
        onRemoveFromQueue={handlers.onRemoveFromQueue}
        replyCount={replyCount}
        onScrollToFirstReply={onScrollToFirstReply}
        onScrollToMessage={handlers.onScrollToMessage}
        isChannel={handlers.isChannel}
        userChatUser1Id={handlers.userChatUser1Id}
        userChatUser2Id={handlers.userChatUser2Id}
        onChatRequestRespond={handlers.onChatRequestRespond}
        isPinned={isPinned}
        onPin={handlers.onPin}
        onUnpin={handlers.onUnpin}
        showReply={handlers.showReply}
        onForwardMessage={handlers.onForwardMessage}
      />
    </div>
  );
}, (prev, next) => {
  if (prev.row.key !== next.row.key) return false;
  if (prev.row.start !== next.row.start) return false;
  if (prev.rowStyle.transform !== next.rowStyle.transform) return false;
  if (prev.rowStyle.transition !== next.rowStyle.transition) return false;
  if (prev.row.index !== next.row.index) return false;
  if (prev.message !== next.message) return false;
  if (prev.messages !== next.messages) return false;
  if (prev.rowCount !== next.rowCount) return false;
  if (prev.replyCount !== next.replyCount) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.isNew !== next.isNew) return false;
  if (prev.staggerIndex !== next.staggerIndex) return false;
  if (prev.fadeDateSeparator !== next.fadeDateSeparator) return false;
  if (prev.eagerMediaMessageIds !== next.eagerMediaMessageIds) return false;
  if (prev.handlers !== next.handlers) return false;
  return true;
});
