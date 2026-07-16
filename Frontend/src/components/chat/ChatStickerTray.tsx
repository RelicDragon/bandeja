import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Smile, X } from 'lucide-react';
import type { Sport } from '@shared/sport';
import type { StickerDto } from '@/api/stickers';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { ChatStickerGrid } from '@/components/chat/ChatStickerGrid';
import { ChatStickerPackRail } from '@/components/chat/ChatStickerPackRail';
import {
  useChatStickerTrayData,
  type StickerTrayTab,
} from '@/components/chat/useChatStickerTrayData';

type ChatStickerTrayProps = {
  open: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: StickerDto) => void;
  sport?: Sport | null;
  busy?: boolean;
};

const TABS: StickerTrayTab[] = ['recent', 'favorites', 'packs'];

export function ChatStickerTray({
  open,
  onClose,
  onSelectSticker,
  sport,
  busy = false,
}: ChatStickerTrayProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;
  const tray = useChatStickerTrayData(open, sport);

  const handleSelect = (sticker: StickerDto) => {
    tray.bumpRecentLocal(sticker);
    onSelectSticker(sticker);
    onClose();
  };

  const emptyForTab =
    tray.tab === 'recent'
      ? t('chat.stickers.emptyRecent', { defaultValue: 'No recent stickers yet' })
      : tray.tab === 'favorites'
        ? t('chat.stickers.emptyFavorites', {
            defaultValue: 'Tap ★ or long-press a sticker to favorite',
          })
        : t('chat.stickers.emptyPack', { defaultValue: 'No stickers in this pack' });

  const showGridLoading =
    tray.loading ||
    (tray.isSearching && tray.searchIndexing && tray.searchResults.length === 0) ||
    (!tray.isSearching && tray.tab === 'packs' && tray.packLoading && tray.packStickers.length === 0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="chat-sticker-tray"
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={panelTransition}
          data-testid="chat-sticker-tray"
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
            aria-label={t('chat.stickers.trayTitle', { defaultValue: 'Stickers' })}
            className="relative flex h-[min(70vh,32rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-gray-900 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={panelTransition}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Smile size={18} className="text-gray-500 dark:text-gray-400" aria-hidden />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {t('chat.stickers.trayTitle', { defaultValue: 'Stickers' })}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label={t('common.close', { defaultValue: 'Close' })}
              >
                <X size={20} />
              </button>
            </div>

            <div
              className="flex gap-1 border-b border-gray-100 px-2 py-2 dark:border-gray-800"
              role="tablist"
              aria-label={t('chat.stickers.tabs', { defaultValue: 'Sticker sections' })}
            >
              {TABS.map((id) => {
                const selected = tray.tab === id;
                const label =
                  id === 'recent'
                    ? t('chat.stickers.tabRecent', { defaultValue: 'Recent' })
                    : id === 'favorites'
                      ? t('chat.stickers.tabFavorites', { defaultValue: 'Favorites' })
                      : t('chat.stickers.tabPacks', { defaultValue: 'Packs' });
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => tray.setTab(id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white'
                        : 'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`}
                    data-testid={`chat-sticker-tab-${id}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800">
              <input
                type="search"
                value={tray.searchQuery}
                onChange={(e) => tray.setSearchQuery(e.target.value)}
                placeholder={t('chat.stickers.searchPlaceholder', {
                  defaultValue: 'Search emoji or title',
                })}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                data-testid="chat-sticker-search"
                aria-label={t('chat.stickers.searchPlaceholder', {
                  defaultValue: 'Search emoji or title',
                })}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tray.error ? (
                <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-sm text-red-600 dark:text-red-400">
                  {t('chat.stickers.loadFailed', { defaultValue: 'Could not load stickers' })}
                </div>
              ) : showGridLoading ? (
                <div className="flex min-h-[8rem] items-center justify-center">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : (
                <ChatStickerGrid
                  stickers={
                    tray.isSearching
                      ? tray.searchResults
                      : tray.tab === 'recent'
                        ? tray.recentStickers
                        : tray.tab === 'favorites'
                          ? tray.favoriteStickers
                          : tray.packStickers
                  }
                  favoriteIds={tray.favoriteIds}
                  onSelect={handleSelect}
                  onToggleFavorite={tray.toggleFavorite}
                  emptyLabel={
                    tray.isSearching
                      ? t('chat.stickers.searchEmpty', { defaultValue: 'No stickers match' })
                      : emptyForTab
                  }
                  busy={busy}
                />
              )}
            </div>

            {tray.tab === 'packs' && !tray.isSearching ? (
              <ChatStickerPackRail
                packs={tray.packs}
                selectedPackId={tray.selectedPackId}
                onSelectPack={tray.setSelectedPackId}
              />
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
