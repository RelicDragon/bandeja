import React, { useState, useEffect, useRef, memo } from 'react';
import { ChatMessage } from '@/api/chat';
import { MessageItem, ContextMenuState } from './MessageItem';
import { messageRowPropsEqual } from './MessageItem/messageRowPropsEqual';

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
  skipStaggerOnOpen?: boolean;
  suppressOpenReactionMotion?: boolean;
  loadMediaEager?: boolean;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  activeContextMenuMessageId: string | null;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
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
}

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = memo(function AnimatedMessageItem({
  message,
  staggerKey,
  skipStaggerOnOpen = false,
  suppressOpenReactionMotion = false,
  loadMediaEager = false,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onEditMessage,
  onPollUpdated,
  onResendQueued,
  onRemoveFromQueue,
  activeContextMenuMessageId,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
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
}) {
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

  const rowContextMenuState: ContextMenuState =
    activeContextMenuMessageId === message.id
      ? contextMenuState
      : { isOpen: false, messageId: null, position: { x: 0, y: 0 } };

  return (
    <div
      className={`transition-opacity duration-500 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
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
        contextMenuState={rowContextMenuState}
        onOpenContextMenu={onOpenContextMenu}
        onCloseContextMenu={onCloseContextMenu}
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
      />
    </div>
  );
}, (prev, next) =>
  messageRowPropsEqual(
    {
      message: prev.message,
      replyCount: prev.replyCount,
      activeContextMenuMessageId: prev.activeContextMenuMessageId,
      isPinned: prev.isPinned ?? false,
      loadMediaEager: prev.loadMediaEager ?? false,
      suppressOpenReactionMotion: prev.suppressOpenReactionMotion ?? false,
      skipStaggerOnOpen: prev.skipStaggerOnOpen,
      showReply: prev.showReply ?? true,
      isChannel: prev.isChannel ?? false,
    },
    {
      message: next.message,
      replyCount: next.replyCount,
      activeContextMenuMessageId: next.activeContextMenuMessageId,
      isPinned: next.isPinned ?? false,
      loadMediaEager: next.loadMediaEager ?? false,
      suppressOpenReactionMotion: next.suppressOpenReactionMotion ?? false,
      skipStaggerOnOpen: next.skipStaggerOnOpen,
      showReply: next.showReply ?? true,
      isChannel: next.isChannel ?? false,
    }
  ));
