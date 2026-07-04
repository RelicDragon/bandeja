import React, { memo } from 'react';
import { ChatMessage } from '@/api/chat';
import { MessageItem } from './MessageItem';
import { messageRowPropsEqual } from './MessageItem/messageRowPropsEqual';
import type { MessageGroupPosition } from '@/utils/chatMessageGrouping';
import {
  closeMessageListContextMenu,
  openMessageListContextMenu,
  useRowContextMenuState,
} from './MessageList/messageListContextMenuStore';
import { useLayoutSettlingForRow } from './MessageList/useMessageListSettling';
import { MessageRowEnterMotion } from './MessageList/MessageRowEnterMotion';
import { ChatDateSeparator } from '@/components/chat/ChatDateSeparator';
import { useAuthStore } from '@/store/authStore';

interface AnimatedMessageItemProps {
  message: ChatMessage;
  isNew: boolean;
  staggerIndex: number;
  dateSeparatorLabel?: string;
  fadeDateSeparator?: boolean;
  loadMediaEager?: boolean;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onReplyMessage?: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  replyCount: number;
  onScrollToFirstReply?: (parentMessageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  isPinned?: boolean;
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
  showReply?: boolean;
  onForwardMessage?: (message: ChatMessage) => void;
  groupPosition?: MessageGroupPosition;
  entityType?: string | null;
  isThreadSearchOutline?: boolean;
  threadSearchHighlightQuery?: string | null;
}

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = memo(function AnimatedMessageItem({
  message,
  isNew,
  staggerIndex,
  dateSeparatorLabel,
  fadeDateSeparator = false,
  loadMediaEager = false,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onEditMessage,
  onPollUpdated,
  onResendQueued,
  onRemoveFromQueue,
  replyCount,
  onScrollToFirstReply,
  onScrollToMessage,
  isChannel = false,
  userChatUser1Id,
  userChatUser2Id,
  onChatRequestRespond,
  isPinned = false,
  onPin,
  onUnpin,
  showReply = true,
  onForwardMessage,
  groupPosition = 'single',
  entityType,
  isThreadSearchOutline = false,
  threadSearchHighlightQuery = null,
}) {
  const { skipStaggerOnOpen, suppressOpenReactionMotion } = useLayoutSettlingForRow();
  const contextMenuState = useRowContextMenuState(message.id);
  const userId = useAuthStore((s) => s.user?.id);
  const shouldAnimate = isNew && !skipStaggerOnOpen;
  const isOutgoing = !isChannel && userId != null && message.senderId === userId;

  return (
    <MessageRowEnterMotion
      animate={shouldAnimate}
      staggerIndex={staggerIndex}
      variant={isOutgoing ? 'outgoing' : 'incoming'}
    >
      {dateSeparatorLabel ? (
        <ChatDateSeparator label={dateSeparatorLabel} fadeIn={fadeDateSeparator} />
      ) : null}
      <MessageItem
        message={message}
        onAddReaction={onAddReaction}
        onRemoveReaction={onRemoveReaction}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onEditMessage={onEditMessage}
        onPollUpdated={onPollUpdated}
        onResendQueued={onResendQueued}
        onRemoveFromQueue={onRemoveFromQueue}
        contextMenuState={contextMenuState}
        onOpenContextMenu={openMessageListContextMenu}
        onCloseContextMenu={closeMessageListContextMenu}
        replyCount={replyCount}
        onScrollToFirstReply={onScrollToFirstReply}
        onScrollToMessage={onScrollToMessage}
        isChannel={isChannel}
        userChatUser1Id={userChatUser1Id}
        userChatUser2Id={userChatUser2Id}
        onChatRequestRespond={onChatRequestRespond}
        isPinned={isPinned}
        onPin={onPin}
        onUnpin={onUnpin}
        showReply={showReply}
        onForwardMessage={onForwardMessage}
        suppressOpenReactionMotion={suppressOpenReactionMotion}
        loadMediaEager={loadMediaEager}
        groupPosition={groupPosition}
        entityType={entityType}
        isThreadSearchOutline={isThreadSearchOutline}
        threadSearchHighlightQuery={threadSearchHighlightQuery}
      />
    </MessageRowEnterMotion>
  );
}, (prev, next) =>
  prev.isNew === next.isNew &&
  prev.staggerIndex === next.staggerIndex &&
  prev.dateSeparatorLabel === next.dateSeparatorLabel &&
  prev.fadeDateSeparator === next.fadeDateSeparator &&
  prev.isThreadSearchOutline === next.isThreadSearchOutline &&
  prev.threadSearchHighlightQuery === next.threadSearchHighlightQuery &&
  messageRowPropsEqual(
    {
      message: prev.message,
      replyCount: prev.replyCount,
      isPinned: prev.isPinned ?? false,
      loadMediaEager: prev.loadMediaEager ?? false,
      showReply: prev.showReply ?? true,
      isChannel: prev.isChannel ?? false,
      groupPosition: prev.groupPosition ?? 'single',
      isThreadSearchOutline: prev.isThreadSearchOutline ?? false,
      threadSearchHighlightQuery: prev.threadSearchHighlightQuery ?? null,
    },
    {
      message: next.message,
      replyCount: next.replyCount,
      isPinned: next.isPinned ?? false,
      loadMediaEager: next.loadMediaEager ?? false,
      showReply: next.showReply ?? true,
      isChannel: next.isChannel ?? false,
      groupPosition: next.groupPosition ?? 'single',
      isThreadSearchOutline: next.isThreadSearchOutline ?? false,
      threadSearchHighlightQuery: next.threadSearchHighlightQuery ?? null,
    }
  ));
