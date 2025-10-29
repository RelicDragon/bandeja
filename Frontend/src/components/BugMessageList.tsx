import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BugMessage } from '@/api/bugChat';
import { BugMessageItem } from './BugMessageItem';
import { MessageSkeletonList } from './MessageSkeleton';
import { useContextMenuManager } from '@/hooks/useContextMenuManager';

interface BugMessageListProps {
  messages: BugMessage[];
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: BugMessage) => void;
  isLoading?: boolean;
  isSwitchingChatType?: boolean;
  onScrollToMessage?: (messageId: string) => void;
}

export const BugMessageList: React.FC<BugMessageListProps> = ({
  messages,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  isSwitchingChatType = false,
  onScrollToMessage,
}) => {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const { contextMenuState, openContextMenu, closeContextMenu, handleScrollStart } = useContextMenuManager();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Only scroll to bottom when new messages are added, not when existing messages are updated
    if (messages.length > previousMessageCountRef.current) {
      scrollToBottom();
    }
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      handleScrollStart();
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScrollStart]);

  if (isSwitchingChatType) {
    return <MessageSkeletonList />;
  }


  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
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
      </div>
    );
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 space-y-1 min-h-0"
    >
      {messages.map((message) => (
        <div key={message.id} id={`message-${message.id}`}>
          <BugMessageItem
            message={message}
            onAddReaction={onAddReaction}
            onRemoveReaction={onRemoveReaction}
            onDeleteMessage={onDeleteMessage}
            onReplyMessage={onReplyMessage}
            contextMenuState={contextMenuState}
            onOpenContextMenu={openContextMenu}
            onCloseContextMenu={closeContextMenu}
            allMessages={messages}
            onScrollToMessage={onScrollToMessage}
          />
        </div>
      ))}


      <div ref={messagesEndRef} />
    </div>
  );
};
