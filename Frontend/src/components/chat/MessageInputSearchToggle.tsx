import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { COMPOSER_TOOLBAR_SPRING } from '@/components/chat/chatListMotion';
import { composerFabButtonClass } from '@/components/chat/TranslateToButton';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const SEARCH_PILL_SHADOW =
  'shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)]';

type MessageInputSearchToggleProps = {
  disabled?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onQueryChange?: (query: string) => void;
};

export function MessageInputSearchToggle({
  disabled = false,
  onExpandedChange,
  onQueryChange,
}: MessageInputSearchToggleProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const transition = reduceMotion ? { duration: 0 } : COMPOSER_TOOLBAR_SPRING;

  const setExpandedState = useCallback(
    (next: boolean) => {
      setExpanded(next);
      onExpandedChange?.(next);
    },
    [onExpandedChange]
  );

  const open = useCallback(() => {
    if (disabled) return;
    setExpandedState(true);
  }, [disabled, setExpandedState]);

  const close = useCallback(() => {
    setQuery('');
    onQueryChange?.('');
    setExpandedState(false);
  }, [onQueryChange, setExpandedState]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), reduceMotion ? 0 : 140);
    return () => window.clearTimeout(id);
  }, [expanded, reduceMotion]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    onQueryChange?.(value);
  };

  return (
    <motion.div
      layout
      transition={transition}
      className={expanded ? 'z-10 min-w-0 flex-1' : 'z-0 shrink-0'}
    >
      {!expanded ? (
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
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onBlur={close}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : 0.1 }}
            placeholder={t('chat.searchInConversation', { defaultValue: 'Search in conversation' })}
            className="h-full w-full rounded-full border-0 bg-transparent pl-9 pr-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100 dark:placeholder-gray-400 dark:focus:ring-blue-400"
            aria-label={t('chat.searchInConversation', { defaultValue: 'Search in conversation' })}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
