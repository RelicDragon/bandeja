import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatMessage } from '@/api/chat';
import { Pin } from 'lucide-react';
import { getUserDisplayName, getMessagePreviewText } from '@/utils/messageMenuUtils';

interface PinnedMessagesBarProps {
  pinnedMessages: ChatMessage[];
  currentIndex: number;
  totalCount: number;
  loadingScrollTargetId?: string | null;
  onItemClick: (messageId: string) => void;
}

export const PinnedMessagesBar: React.FC<PinnedMessagesBarProps> = ({
  pinnedMessages,
  currentIndex,
  totalCount,
  loadingScrollTargetId,
  onItemClick,
}) => {
  if (pinnedMessages.length === 0) return null;
  const msg = pinnedMessages[0];

  return (
    <div className="relative border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex-shrink-0 overflow-hidden">
      <button
        type="button"
        onClick={() => onItemClick(msg.id)}
        disabled={loadingScrollTargetId === msg.id}
        className="w-full text-left px-4 py-2 flex items-center gap-1 min-w-0 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-60"
      >
        {totalCount > 1 && (
          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
            {currentIndex}/{totalCount}
          </span>
        )}
        <Pin className="w-3.5 h-3.5 flex-shrink-0 text-primary-500" />
        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
          {msg.sender ? getUserDisplayName(msg.sender) : ''}:
        </span>
        <div className="flex-1 min-w-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={msg.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.2 }}
              className="block text-sm text-gray-800 dark:text-gray-200 truncate"
            >
              {loadingScrollTargetId === msg.id ? '…' : getMessagePreviewText(msg)}
            </motion.span>
          </AnimatePresence>
        </div>
      </button>
    </div>
  );
};
