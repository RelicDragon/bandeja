import React, { memo } from 'react';
import { MessageItem } from './MessageItem';
import {
  messageRowPropsEqual,
  toMessageRowMemoProps,
} from './MessageItem/messageRowPropsEqual';
import type { MessageRowConfig, MessageRowHandlers } from './MessageItem/types';
import {
  closeMessageListContextMenu,
  openMessageListContextMenu,
  useRowContextMenuState,
} from './MessageList/messageListContextMenuStore';
import { useLayoutSettlingForRow } from './MessageList/useMessageListSettling';
import { MessageRowEnterMotion } from './MessageList/MessageRowEnterMotion';
import { ChatDateSeparator } from '@/components/chat/ChatDateSeparator';
import { useAuthStore } from '@/store/authStore';
import type { ChatMessage } from '@/api/chat';

interface AnimatedMessageItemProps extends MessageRowConfig {
  message: ChatMessage;
  handlers: MessageRowHandlers;
  isNew: boolean;
  staggerIndex: number;
  dateSeparatorLabel?: string;
  fadeDateSeparator?: boolean;
}

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = memo(
  function AnimatedMessageItem({
    message,
    handlers,
    isNew,
    staggerIndex,
    dateSeparatorLabel,
    fadeDateSeparator = false,
    loadMediaEager = false,
    replyCount,
    isChannel = false,
    userChatUser1Id,
    userChatUser2Id,
    isPinned = false,
    showReply = true,
    groupPosition = 'single',
    entityType,
    isThreadSearchOutline = false,
    threadSearchHighlightQuery = null,
  }: AnimatedMessageItemProps) {
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
          handlers={handlers}
          contextMenuState={contextMenuState}
          onOpenContextMenu={openMessageListContextMenu}
          onCloseContextMenu={closeMessageListContextMenu}
          replyCount={replyCount}
          isChannel={isChannel}
          userChatUser1Id={userChatUser1Id}
          userChatUser2Id={userChatUser2Id}
          isPinned={isPinned}
          showReply={showReply}
          suppressOpenReactionMotion={suppressOpenReactionMotion}
          loadMediaEager={loadMediaEager}
          groupPosition={groupPosition}
          entityType={entityType}
          isThreadSearchOutline={isThreadSearchOutline}
          threadSearchHighlightQuery={threadSearchHighlightQuery}
        />
      </MessageRowEnterMotion>
    );
  },
  (prev, next) =>
    prev.isNew === next.isNew &&
    prev.staggerIndex === next.staggerIndex &&
    prev.dateSeparatorLabel === next.dateSeparatorLabel &&
    prev.fadeDateSeparator === next.fadeDateSeparator &&
    messageRowPropsEqual(toMessageRowMemoProps(prev), toMessageRowMemoProps(next))
);
