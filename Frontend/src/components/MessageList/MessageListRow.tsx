import { memo } from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import { AnimatedMessageItem } from '@/components/AnimatedMessageItem';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';
import { messageMatchesThreadSearchQuery } from '@/services/chat/chatLocalMessageSearchText';
import type { MessageRowHandlers } from '@/components/MessageItem/types';

type VirtualRowStyle = { transform: string; transition?: string };

type MessageListRowProps = {
  row: VirtualItem;
  rowStyle: VirtualRowStyle;
  message?: ChatMessage;
  isEndSpacer: boolean;
  dateSeparatorLabel: string | null;
  groupPosition: MessageGroupPosition;
  measureElement: (node: Element | null) => void;
  loadMediaEager: boolean;
  replyCount: number;
  isPinned: boolean;
  isNew: boolean;
  staggerIndex: number;
  fadeDateSeparator?: boolean;
  handlers: MessageRowHandlers;
  isChannel: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  showReply: boolean;
  entityType?: string | null;
  threadSearchOutlineQuery?: string | null;
};

export const MessageListRow = memo(function MessageListRow({
  row,
  rowStyle,
  message,
  isEndSpacer,
  dateSeparatorLabel,
  groupPosition,
  measureElement,
  loadMediaEager,
  replyCount,
  isPinned,
  isNew,
  staggerIndex,
  fadeDateSeparator = false,
  handlers,
  isChannel,
  userChatUser1Id,
  userChatUser2Id,
  showReply,
  entityType,
  threadSearchOutlineQuery = null,
}: MessageListRowProps) {
  if (isEndSpacer) {
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

  const isThreadSearchOutline =
    threadSearchOutlineQuery != null &&
    messageMatchesThreadSearchQuery(message, threadSearchOutlineQuery);
  const threadSearchHighlightQuery = isThreadSearchOutline ? threadSearchOutlineQuery : null;

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
        handlers={handlers}
        isNew={isNew}
        staggerIndex={staggerIndex}
        dateSeparatorLabel={dateSeparatorLabel ?? undefined}
        fadeDateSeparator={fadeDateSeparator}
        loadMediaEager={loadMediaEager}
        groupPosition={groupPosition}
        replyCount={replyCount}
        isChannel={isChannel}
        userChatUser1Id={userChatUser1Id}
        userChatUser2Id={userChatUser2Id}
        isPinned={isPinned}
        showReply={showReply}
        entityType={entityType}
        isThreadSearchOutline={isThreadSearchOutline}
        threadSearchHighlightQuery={threadSearchHighlightQuery}
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
  if (prev.isEndSpacer !== next.isEndSpacer) return false;
  if (prev.dateSeparatorLabel !== next.dateSeparatorLabel) return false;
  if (prev.groupPosition !== next.groupPosition) return false;
  if (prev.loadMediaEager !== next.loadMediaEager) return false;
  if (prev.replyCount !== next.replyCount) return false;
  if (prev.isPinned !== next.isPinned) return false;
  if (prev.isNew !== next.isNew) return false;
  if (prev.staggerIndex !== next.staggerIndex) return false;
  if (prev.fadeDateSeparator !== next.fadeDateSeparator) return false;
  if (prev.handlers !== next.handlers) return false;
  if (prev.isChannel !== next.isChannel) return false;
  if (prev.userChatUser1Id !== next.userChatUser1Id) return false;
  if (prev.userChatUser2Id !== next.userChatUser2Id) return false;
  if (prev.showReply !== next.showReply) return false;
  if (prev.entityType !== next.entityType) return false;
  if (prev.threadSearchOutlineQuery !== next.threadSearchOutlineQuery) return false;
  return true;
});
