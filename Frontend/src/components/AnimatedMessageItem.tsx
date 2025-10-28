import React, { useState, useEffect } from 'react';
import { ChatMessage } from '@/api/chat';
import { MessageItem } from './MessageItem';

interface ContextMenuState {
  isOpen: boolean;
  messageId: string | null;
  position: { x: number; y: number };
}

interface AnimatedMessageItemProps {
  message: ChatMessage;
  index: number;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  contextMenuState: ContextMenuState;
  onOpenContextMenu: (messageId: string, position: { x: number; y: number }) => void;
  onCloseContextMenu: () => void;
  allMessages: ChatMessage[];
  onScrollToMessage?: (messageId: string) => void;
}

export const AnimatedMessageItem: React.FC<AnimatedMessageItemProps> = ({
  message,
  index,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  contextMenuState,
  onOpenContextMenu,
  onCloseContextMenu,
  allMessages,
  onScrollToMessage,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in with staggered delay based on index, starting earlier for parallel transition
    const baseDelay = 200; // Start fading in after 200ms
    const staggerDelay = Math.min(index * 80, 800); // Max 800ms stagger
    const totalDelay = baseDelay + staggerDelay;
    
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, totalDelay);

    return () => {
      clearTimeout(timer);
    };
  }, [index]);

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
        contextMenuState={contextMenuState}
        onOpenContextMenu={onOpenContextMenu}
        onCloseContextMenu={onCloseContextMenu}
        allMessages={allMessages}
        onScrollToMessage={onScrollToMessage}
      />
    </div>
  );
};
