import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage, Poll } from '@/api/chat';
import { AnimatedMessageItem } from './AnimatedMessageItem';
import { useContextMenuManager } from '@/hooks/useContextMenuManager';
import { ArrowUp } from 'lucide-react';

interface MessageListProps {
  messages: ChatMessage[];
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: ChatMessage) => void;
  onEditMessage?: (message: ChatMessage) => void;
  onPollUpdated?: (messageId: string, updatedPoll: Poll) => void;
  onResendQueued?: (tempId: string) => void;
  onRemoveFromQueue?: (tempId: string) => void;
  isLoading?: boolean;
  isLoadingMessages?: boolean;
  isSwitchingChatType?: boolean;
  onScrollToMessage?: (messageId: string) => void;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isInitialLoad?: boolean;
  isLoadingMore?: boolean;
  disableReadTracking?: boolean;
  isChannel?: boolean;
  userChatUser1Id?: string;
  userChatUser2Id?: string;
  onChatRequestRespond?: (messageId: string, accepted: boolean) => void;
  hasContextPanel?: boolean;
  pinnedMessageIds?: string[];
  onPin?: (message: ChatMessage) => void;
  onUnpin?: (messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
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
  disableReadTracking = false,
  isChannel = false,
  userChatUser1Id,
  userChatUser2Id,
  onChatRequestRespond,
  hasContextPanel = false,
  pinnedMessageIds = [],
  onPin,
  onUnpin,
}) => {
  const { t } = useTranslation();
  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(0);
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const justLoadedOlderMessagesRef = useRef(false);
  const { contextMenuState, openContextMenu, closeContextMenu, handleScrollStart } = useContextMenuManager();
  const [isButtonVisible, setIsButtonVisible] = React.useState(true);
  const [shouldRenderButton, setShouldRenderButton] = React.useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
    
    const container = messagesContainerRef.current;
    if (!container) return;

    if (isLoadingMore) {
      previousScrollHeightRef.current = container.scrollHeight;
      previousScrollTopRef.current = container.scrollTop;
      justLoadedOlderMessagesRef.current = false;
    } else if (isLoadingMoreRef.current) {
      justLoadedOlderMessagesRef.current = true;
      setTimeout(() => {
        justLoadedOlderMessagesRef.current = false;
      }, 500);
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const currentMessageCount = messages.length;
    const previousMessageCount = previousMessageCountRef.current;
    const isNewMessagesAdded = currentMessageCount > previousMessageCount;

    if (isNewMessagesAdded) {
      const wasLoadingMore = isLoadingMoreRef.current || isLoadingMore;
      const justLoadedOlder = justLoadedOlderMessagesRef.current;
      
      if (wasLoadingMore || justLoadedOlder) {
        const previousScrollHeight = previousScrollHeightRef.current;
        const previousScrollTop = previousScrollTopRef.current;
        
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (container) {
              const currentScrollHeight = container.scrollHeight;
              const scrollDifference = currentScrollHeight - previousScrollHeight;
              const newScrollTop = previousScrollTop + scrollDifference;
              container.scrollTop = newScrollTop;
            }
          });
        });
      } else {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isAtBottom) {
          scrollToBottom();
        }
      }
    }

    previousMessageCountRef.current = currentMessageCount;
    if (!isLoadingMore) {
      requestAnimationFrame(() => {
        if (container) {
          previousScrollHeightRef.current = container.scrollHeight;
        }
      });
    }
  }, [messages, isLoadingMore]);

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

  useEffect(() => {
    if (hasMoreMessages && !isInitialLoad) {
      setIsButtonVisible(true);
      setShouldRenderButton(true);
    }
  }, [hasMoreMessages, isInitialLoad]);

  if (isLoadingMessages || isSwitchingChatType || isInitialLoad) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 space-y-1 min-h-0" />
    );
  }

  if (messages.length === 0 && !isLoadingMessages && !isInitialLoad) {
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

  const handleLoadMoreClick = () => {
    if (onLoadMore && !isLoading) {
      setIsButtonVisible(false);
      setTimeout(() => {
        setShouldRenderButton(false);
        onLoadMore();
      }, 300);
    }
  };

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-auto bg-gray-50 dark:bg-gray-800 p-4 space-y-1 min-h-0 overscroll-contain"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {hasContextPanel && <div className="pt-6 flex-shrink-0" />}
      {hasMoreMessages && !isInitialLoad && onLoadMore && shouldRenderButton && (
        <div 
          className={`flex justify-center mb-4 transition-opacity duration-300 ${
            isButtonVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <button
            onClick={handleLoadMoreClick}
            disabled={isLoading}
            className="py-3 px-6 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 shadow-lg shadow-primary-500/50 hover:shadow-xl hover:shadow-primary-600/60 transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <span>{isLoading ? t('common.loading') : t('chat.messages.loadMore')}</span>
            {!isLoading && <ArrowUp size={16} className="animate-bounce" />}
          </button>
        </div>
      )}
      {messages.map((message, index) => (
        <div key={(message as { _optimisticId?: string })._optimisticId ?? message.id} id={`message-${message.id}`}>
          <AnimatedMessageItem
            message={message}
            index={index}
            onAddReaction={onAddReaction}
            onRemoveReaction={onRemoveReaction}
            onDeleteMessage={onDeleteMessage}
            onReplyMessage={onReplyMessage}
            onEditMessage={onEditMessage}
            onPollUpdated={onPollUpdated}
            onResendQueued={onResendQueued}
            onRemoveFromQueue={onRemoveFromQueue}
            contextMenuState={contextMenuState}
            onOpenContextMenu={openContextMenu}
            onCloseContextMenu={closeContextMenu}
            allMessages={messages}
            onScrollToMessage={onScrollToMessage}
            disableReadTracking={disableReadTracking}
            isChannel={isChannel}
            userChatUser1Id={userChatUser1Id}
            userChatUser2Id={userChatUser2Id}
            onChatRequestRespond={onChatRequestRespond}
            isPinned={pinnedSet.has(message.id)}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        </div>
      ))}
      
      
      <div ref={messagesEndRef} className="pb-32 md:pb-4" />
    </div>
  );
};
