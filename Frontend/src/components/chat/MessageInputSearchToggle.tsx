import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Loader2, Search, X } from 'lucide-react';
import { COMPOSER_TOOLBAR_SPRING } from '@/components/chat/chatListMotion';
import { composerFabButtonClass } from '@/components/chat/TranslateToButton';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useThreadSearch } from '@/pages/GameChat/useThreadView';

const SEARCH_PILL_SHADOW =
  'shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)]';

type MessageInputSearchToggleProps = {
  disabled?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function MessageInputSearchToggle({ disabled = false, onExpandedChange }: MessageInputSearchToggleProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const {
    searchQuery,
    setSearchQuery,
    isSearchActive,
    setIsSearchActive,
    resultCount,
    isLoadingResults,
    clearSearch,
    registerSearchInputBlur,
    showSearchResults,
  } = useThreadSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  const transition = reduceMotion ? { duration: 0 } : COMPOSER_TOOLBAR_SPRING;

  useEffect(() => {
    registerSearchInputBlur(() => {
      inputRef.current?.blur();
    });
    return () => registerSearchInputBlur(null);
  }, [registerSearchInputBlur]);

  useEffect(() => {
    onExpandedChange?.(isSearchActive);
  }, [isSearchActive, onExpandedChange]);

  const open = useCallback(() => {
    if (disabled) return;
    setIsSearchActive(true);
  }, [disabled, setIsSearchActive]);

  const close = useCallback(() => {
    clearSearch();
  }, [clearSearch]);

  useEffect(() => {
    if (!isSearchActive) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 140);
    return () => window.clearTimeout(id);
  }, [isSearchActive, reduceMotion]);

  const showCount = resultCount > 0 && !isLoadingResults;
  const showLoadingIndicator = isLoadingResults && searchQuery.trim().length >= 2;

  return (
    <motion.div
      layout
      transition={transition}
      className={isSearchActive ? 'z-10 min-w-0 flex-1' : 'z-0 shrink-0'}
    >
      {!isSearchActive ? (
        <motion.button
          type="button"
          layoutId="composer-search-control"
          transition={transition}
          onClick={open}
          disabled={disabled}
          className={composerFabButtonClass}
          title={t('chat.search', { defaultValue: 'Search' })}
          aria-label={t('chat.search', { defaultValue: 'Search' })}
        >
          <Search size={20} className="text-gray-700 dark:text-gray-300" />
        </motion.button>
      ) : (
        <motion.div
          layoutId="composer-search-control"
          transition={transition}
          className={`relative h-11 w-full min-w-0 rounded-full border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${SEARCH_PILL_SHADOW}`}
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            size={18}
            aria-hidden
          />
          <motion.input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => showSearchResults()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : 0.1 }}
            placeholder={t('chat.searchInConversation', { defaultValue: 'Search in conversation' })}
            className={`h-full w-full rounded-full border-0 bg-transparent pl-9 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-blue-400 ${showCount || showLoadingIndicator ? 'pr-[4.75rem]' : 'pr-10'}`}
            aria-label={t('chat.searchInConversation', { defaultValue: 'Search in conversation' })}
          />
          {showLoadingIndicator ? (
            <span
              className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2"
              aria-live="polite"
              aria-label={t('common.loading', { defaultValue: 'Loading...' })}
            >
              <Loader2 size={14} className="animate-spin text-blue-600 dark:text-blue-400" aria-hidden />
            </span>
          ) : showCount ? (
            <span
              className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-xs font-medium tabular-nums text-blue-600 dark:text-blue-400"
              aria-live="polite"
            >
              {resultCount}
            </span>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            title={t('common.close', { defaultValue: 'Close' })}
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={16} aria-hidden />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
