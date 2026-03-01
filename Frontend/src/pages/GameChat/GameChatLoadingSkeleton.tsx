import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { MessageList } from '@/components/MessageList';
import type { ChatContextType } from '@/api/chat';

export interface GameChatLoadingSkeletonProps {
  onBack: () => void;
  contextType: ChatContextType;
  onAddReaction: (messageId: string, emoji: string) => void;
  onRemoveReaction: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onReplyMessage: (message: import('@/api/chat').ChatMessage) => void;
  onPollUpdated: (messageId: string, updatedPoll: import('@/api/chat').Poll) => void;
  onScrollToMessage: (messageId: string) => void;
  onLoadMore: () => void;
}

export const GameChatLoadingSkeleton: React.FC<GameChatLoadingSkeletonProps> = ({
  onBack,
  contextType,
  onAddReaction,
  onRemoveReaction,
  onDeleteMessage,
  onReplyMessage,
  onPollUpdated,
  onScrollToMessage,
  onLoadMore,
}) => (
  <div className="chat-container bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 z-40 shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </header>
    <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <MessageList
        messages={[]}
        onAddReaction={onAddReaction}
        onRemoveReaction={onRemoveReaction}
        onDeleteMessage={onDeleteMessage}
        onReplyMessage={onReplyMessage}
        onPollUpdated={onPollUpdated}
        isLoading={false}
        isLoadingMessages={true}
        isSwitchingChatType={false}
        onScrollToMessage={onScrollToMessage}
        hasMoreMessages={false}
        onLoadMore={onLoadMore}
        isInitialLoad={true}
        isLoadingMore={false}
        disableReadTracking={contextType === 'USER'}
      />
    </main>
  </div>
);
