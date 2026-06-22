import { useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/api/chat';
import { CHAT_PANEL_TRANSITION, chatListRowEnterDelay } from '@/components/chat/chatListMotion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useAuthStore } from '@/store/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';
import { getThreadSearchPreviewLine, getThreadSearchSenderLabel } from './threadSearchPreview';
import { useThreadScroll, useThreadSearch } from './useThreadView';

type ThreadSearchResultsPanelProps = {
  visible: boolean;
  results: ChatMessage[];
  isLoadingResults: boolean;
  hasMoreResults: boolean;
  onLoadMore: () => void;
};

function ThreadSearchLoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-3" aria-hidden>
      <Loader2 size={18} className="animate-spin text-blue-500 dark:text-blue-400" />
    </div>
  );
}

export function ThreadSearchResultsPanel({
  visible,
  results,
  isLoadingResults,
  hasMoreResults,
  onLoadMore,
}: ThreadSearchResultsPanelProps) {
  const { t } = useTranslation();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const reduceMotion = usePrefersReducedMotion();
  const { scrollToMessageId } = useThreadScroll();
  const { dismissSearch } = useThreadSearch();

  const transition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;
  const showInitialLoading = isLoadingResults && results.length === 0;
  const showRefreshing = isLoadingResults && results.length > 0;

  const handleResultClick = useCallback(
    (messageId: string) => {
      void scrollToMessageId(messageId);
      dismissSearch();
    },
    [dismissSearch, scrollToMessageId]
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
          className="relative flex-shrink-0 overflow-hidden border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95"
        >
          {showRefreshing ? (
            <motion.div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 bg-gradient-to-r from-blue-400/0 via-blue-500/80 to-blue-400/0 dark:from-blue-500/0 dark:via-blue-400/80 dark:to-blue-500/0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {!reduceMotion ? (
                <motion.div
                  className="h-full w-1/3 bg-white/60 dark:bg-white/30"
                  animate={{ x: ['-100%', '400%'] }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : null}
            </motion.div>
          ) : null}
          <div className="flex max-h-[min(40vh,280px)] min-h-0 flex-col">
            {showInitialLoading ? (
              <ThreadSearchLoadingSpinner />
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
                {t('chat.noMessageResults', { defaultValue: 'No messages found' })}
              </div>
            ) : (
              <>
                <ul
                  className={`min-h-0 flex-1 overflow-y-auto overscroll-contain transition-opacity duration-200 ${showRefreshing ? 'opacity-60' : 'opacity-100'}`}
                >
                  {results.map((message, index) => {
                    const preview = getThreadSearchPreviewLine(message, t);
                    const senderLabel = getThreadSearchSenderLabel(message, currentUserId, t);
                    return (
                      <motion.li
                        key={message.id}
                        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: reduceMotion ? 0 : 0.22,
                          delay: reduceMotion ? 0 : chatListRowEnterDelay(index),
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleResultClick(message.id)}
                          disabled={showRefreshing}
                          className="flex w-full min-w-0 flex-col gap-px border-b border-gray-100 px-3 py-1.5 text-left last:border-b-0 hover:bg-gray-50 disabled:pointer-events-none dark:border-gray-800 dark:hover:bg-gray-800/60"
                        >
                          <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                            <span className="min-w-0 truncate">{senderLabel}</span>
                            <span className="shrink-0 tabular-nums">{formatRelativeTime(message.createdAt)}</span>
                          </div>
                          <span className="min-w-0 truncate text-[11px] leading-tight text-gray-900 dark:text-gray-100">
                            {preview}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
                {hasMoreResults ? (
                  <button
                    type="button"
                    onClick={onLoadMore}
                    disabled={isLoadingResults}
                    className="flex shrink-0 items-center justify-center gap-2 border-t border-gray-100 px-3 py-2 text-[11px] font-medium text-blue-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:text-blue-400 dark:hover:bg-gray-800/60"
                  >
                    {isLoadingResults ? (
                      <>
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                        {t('chat.messages.loading', { defaultValue: 'Loading...' })}
                      </>
                    ) : (
                      t('chat.loadMoreResults', { defaultValue: 'Load more' })
                    )}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
