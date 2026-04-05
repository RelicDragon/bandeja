import React, { useState, useEffect } from 'react';
import { ChatMessage } from '@/api/chat';
import { MessageItem, ContextMenuState } from './MessageItem';

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
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages: ChatMessage[];
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

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = ({
  message,
  staggerKey,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onEditMessage,
  onPollUpdated,
  onResendQueued,
  onRemoveFromQueue,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
  allMessages,
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
}) => {
  const skipStagger = !isRecentMessage(message.createdAt);
  const [isVisible, setIsVisible] = useState(skipStagger);

  useEffect(() => {
    if (skipStagger || !isRecentMessage(message.createdAt)) {
      setIsVisible(true);
      return;
    }
    setIsVisible(false);
    const totalDelay = staggerMsForId(staggerKey);
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, totalDelay);

    return () => {
      clearTimeout(timer);
    };
  }, [staggerKey, message.createdAt, skipStagger]);

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
        contextMenuState={contextMenuState}
        onOpenContextMenu={onOpenContextMenu}
        onCloseContextMenu={onCloseContextMenu}
        allMessages={allMessages}
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
      />
    </div>
  );
};
