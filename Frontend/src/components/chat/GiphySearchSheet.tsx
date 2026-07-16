import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Search, X } from 'lucide-react';
import type { GiphySearchItem } from '@/api/giphy';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { GiphySearchGrid } from '@/components/chat/GiphySearchGrid';
import { useGiphySearch } from '@/components/chat/useGiphySearch';

type GiphySearchSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: GiphySearchItem) => void;
  busy?: boolean;
};

export function GiphySearchSheet({
  open,
  onClose,
  onSelect,
  busy = false,
}: GiphySearchSheetProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;
  const search = useGiphySearch(open);

  const handleSelect = (item: GiphySearchItem) => {
    onSelect(item);
    onClose();
  };

  const emptyLabel =
    search.error === 'unavailable'
      ? t('chat.giphy.unavailable', { defaultValue: 'GIF search is unavailable right now' })
      : search.error === 'rateLimited'
        ? t('chat.giphy.rateLimited', { defaultValue: 'Too many searches — try again shortly' })
        : search.error === 'failed'
          ? t('chat.giphy.loadFailed', { defaultValue: 'Could not load GIFs' })
          : search.query.trim()
            ? t('chat.giphy.noResults', { defaultValue: 'No GIFs found' })
            : t('chat.giphy.emptyTrending', { defaultValue: 'No trending GIFs right now' });

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="giphy-search-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={panelTransition}
          data-testid="giphy-search-sheet"
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('common.close', { defaultValue: 'Close' })}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.giphy.sheetTitle', { defaultValue: 'GIF search' })}
            className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            style={{ maxHeight: 'min(78vh, 36rem)' }}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={panelTransition}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('chat.giphy.sheetTitle', { defaultValue: 'GIF search' })}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
              <label className="relative block">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder={t('chat.giphy.searchPlaceholder', {
                    defaultValue: 'Search Giphy',
                  })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none ring-blue-500 focus:ring-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  data-testid="giphy-search-input"
                  autoFocus
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {search.loading && search.items.length === 0 ? (
                <div className="flex min-h-[10rem] items-center justify-center">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : search.error && search.items.length === 0 ? (
                <div className="flex min-h-[10rem] flex-col items-center justify-center gap-3 px-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{emptyLabel}</p>
                  {search.error !== 'unavailable' ? (
                    <button
                      type="button"
                      onClick={search.refresh}
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      {t('common.retry', { defaultValue: 'Retry' })}
                    </button>
                  ) : null}
                </div>
              ) : (
                <GiphySearchGrid
                  items={search.items}
                  onSelect={handleSelect}
                  busy={busy}
                  emptyLabel={emptyLabel}
                  loadingMore={search.loadingMore}
                  hasMore={search.hasMore}
                  onLoadMore={search.loadMore}
                />
              )}
            </div>

            <p className="px-4 pb-2 pt-1 text-center text-[10px] uppercase tracking-wide text-gray-400">
              {t('chat.giphy.poweredBy', { defaultValue: 'Powered by GIPHY' })}
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
