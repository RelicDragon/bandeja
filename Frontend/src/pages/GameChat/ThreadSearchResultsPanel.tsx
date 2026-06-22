import { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/api/chat';
import {
  CHAT_PANEL_TRANSITION,
  THREAD_SEARCH_DISMISS_SCROLL_DEFER_MS,
} from '@/components/chat/chatListMotion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useAuthStore } from '@/store/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';
import { getThreadSearchPreviewLine, getThreadSearchSenderLabel } from './threadSearchPreview';
import { useThreadScroll, useThreadSearch } from './useThreadView';

type ThreadSearchResultsPanelProps = {
  visible: boolean;
  results: ChatMessage[];
  isSearching: boolean;
};

export function ThreadSearchResultsPanel({ visible, results, isSearching }: ThreadSearchResultsPanelProps) {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const reduceMotion = usePrefersReducedMotion();
  const { scrollToMessageId } = useThreadScroll();
  const { dismissSearch } = useThreadSearch();

  const transition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;

  const handleResultClick = useCallback(
    (messageId: string) => {
      dismissSearch();
      const deferMs = reduceMotion ? 0 : THREAD_SEARCH_DISMISS_SCROLL_DEFER_MS;
      window.setTimeout(() => {
        void scrollToMessageId(messageId);
      }, deferMs);
    },
    [dismissSearch, reduceMotion, scrollToMessageId]
  );

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="thread-search-results"
          initial={reduceMotion ? false : { opacity: 0, maxHeight: 0 }}
          animate={{ opacity: 1, maxHeight: '40%' }}
          exit={reduceMotion ? undefined : { opacity: 0, maxHeight: 0 }}
          transition={transition}
          className="flex-shrink-0 overflow-hidden border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95"
        >
          <div className="flex min-h-0 flex-col">
            {isSearching && results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
                {t('chat.noMessageResults', { defaultValue: 'No messages found' })}
              </div>
            ) : (
              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {results.map((message) => {
                  const preview = getThreadSearchPreviewLine(message, t);
                  const senderLabel = getThreadSearchSenderLabel(message, currentUserId, t);
                  return (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => handleResultClick(message.id)}
                        className="flex w-full min-w-0 flex-col gap-px border-b border-gray-100 px-3 py-1.5 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                      >
                        <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                          <span className="min-w-0 truncate">{senderLabel}</span>
                          <span className="shrink-0 tabular-nums">{formatRelativeTime(message.createdAt)}</span>
                        </div>
                        <span className="min-w-0 truncate text-[11px] leading-tight text-gray-900 dark:text-gray-100">
                          {preview}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
