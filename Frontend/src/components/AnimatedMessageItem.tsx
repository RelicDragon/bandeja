import React, { useState, useEffect, useRef, memo } from 'react';
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

function staggerMsForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i);
  }
  return 20 + (Math.abs(h) % 11) * 10;
}

const STAGGER_SKIP_AGE_MS = 90_000;

function isRecentMessage(createdAt: string | undefined): boolean {
  if (!createdAt) return true;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t < STAGGER_SKIP_AGE_MS;
}

interface AnimatedMessageItemProps {
  message: ChatMessage;
  staggerKey: string;
  loadMediaEager?: boolean;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
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
}

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = memo(function AnimatedMessageItem({
  message,
  staggerKey,
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
}) {
  const { skipStaggerOnOpen, suppressOpenReactionMotion } = useLayoutSettlingForRow();
  const contextMenuState = useRowContextMenuState(message.id);

  const skipStagger = skipStaggerOnOpen || !isRecentMessage(message.createdAt);
  const [isVisible, setIsVisible] = useState(skipStagger);
  const revealedRef = useRef(skipStagger);

  useEffect(() => {
    if (skipStagger || !isRecentMessage(message.createdAt)) {
      revealedRef.current = true;
      setIsVisible(true);
      return;
    }
    if (revealedRef.current) {
      setIsVisible(true);
      return;
    }
    setIsVisible(false);
    const totalDelay = staggerMsForId(staggerKey);
    const timer = setTimeout(() => {
      revealedRef.current = true;
      setIsVisible(true);
    }, totalDelay);

    return () => {
      clearTimeout(timer);
    };
  }, [staggerKey, message.createdAt, skipStagger]);

  return (
    <div
      className={`transition-[opacity,transform] duration-300 ease-out will-change-[opacity,transform] motion-reduce:transition-none motion-reduce:transform-none ${
        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'
      }`}
    >
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
      />
    </div>
  );
}, (prev, next) =>
  messageRowPropsEqual(
    {
      message: prev.message,
      replyCount: prev.replyCount,
      isPinned: prev.isPinned ?? false,
      loadMediaEager: prev.loadMediaEager ?? false,
      showReply: prev.showReply ?? true,
      isChannel: prev.isChannel ?? false,
      groupPosition: prev.groupPosition ?? 'single',
    },
    {
      message: next.message,
      replyCount: next.replyCount,
      isPinned: next.isPinned ?? false,
      loadMediaEager: next.loadMediaEager ?? false,
      showReply: next.showReply ?? true,
      isChannel: next.isChannel ?? false,
      groupPosition: next.groupPosition ?? 'single',
    }
  ));
