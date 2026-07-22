import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Clapperboard, Loader2, Search, Smile, X } from 'lucide-react';
import type { Sport } from '@shared/sport';
import type { StickerDto } from '@/api/stickers';
import type { GiphySearchItem } from '@/api/giphy';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import {
  chatStickerTrayPanelHeightClass,
  shouldExpandChatStickerTray,
} from '@/components/chat/chatStickerTrayLayout';
import { ChatStickerGrid } from '@/components/chat/ChatStickerGrid';
import { ChatStickerPackRail } from '@/components/chat/ChatStickerPackRail';
import { ChatMediaRecentGrid } from '@/components/chat/ChatMediaRecentGrid';
import { GiphySearchGrid } from '@/components/chat/GiphySearchGrid';
import { useGiphySearch } from '@/components/chat/useGiphySearch';
import {
  useChatStickerTrayData,
  type StickerTrayTab,
} from '@/components/chat/useChatStickerTrayData';

type ChatStickerTrayProps = {
  open: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: StickerDto) => void;
  onSelectGif: (gif: GiphySearchItem) => void;
  initialTab?: StickerTrayTab;
  sport?: Sport | null;
  busy?: boolean;
};

const TABS: StickerTrayTab[] = ['recent', 'favorites', 'packs', 'gifs'];

export function ChatStickerTray({
  open,
  onClose,
  onSelectSticker,
  onSelectGif,
  initialTab = 'recent',
  sport,
  busy = false,
}: ChatStickerTrayProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const panelTransition = reduceMotion ? { duration: 0 } : CHAT_PANEL_TRANSITION;
  const tray = useChatStickerTrayData(open, sport, initialTab);
  const gifs = useGiphySearch(open && tray.tab === 'gifs');
  const keyboard = useKeyboardInset();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchBlurTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelId = useId();
  const expandToFullHeight = shouldExpandChatStickerTray({
    searchFocused,
    keyboardVisible: keyboard.visible,
  });

  useEffect(() => {
    if (open) return;
    setSearchFocused(false);
    if (searchBlurTimerRef.current != null) {
      window.clearTimeout(searchBlurTimerRef.current);
      searchBlurTimerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (searchBlurTimerRef.current != null) {
        window.clearTimeout(searchBlurTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  const handleSelect = (sticker: StickerDto) => {
    tray.bumpRecentLocal(sticker);
    onSelectSticker(sticker);
    onClose();
  };

  const handleSelectGif = (gif: GiphySearchItem) => {
    onSelectGif(gif);
    onClose();
  };

  const emptyForTab =
    tray.tab === 'recent'
      ? t('chat.stickers.emptyRecent', { defaultValue: 'No recent stickers or GIFs yet' })
      : tray.tab === 'favorites'
        ? t('chat.stickers.emptyFavorites', {
            defaultValue: 'Tap ★ or long-press a sticker to favorite',
          })
        : tray.tab === 'packs'
          ? t('chat.stickers.emptyPack', { defaultValue: 'No stickers in this pack' })
          : '';

  const gifEmptyLabel =
    gifs.error === 'unavailable'
      ? t('chat.giphy.unavailable', { defaultValue: 'GIF search is unavailable right now' })
      : gifs.error === 'rateLimited'
        ? t('chat.giphy.rateLimited', { defaultValue: 'Too many searches — try again shortly' })
        : gifs.error === 'failed'
          ? t('chat.giphy.loadFailed', { defaultValue: 'Could not load GIFs' })
          : gifs.query.trim()
            ? t('chat.giphy.noResults', { defaultValue: 'No GIFs found' })
            : t('chat.giphy.emptyTrending', { defaultValue: 'No trending GIFs right now' });
  const gifSearchLabel =
    gifs.provider === 'KLIPY'
      ? t('chat.giphy.searchKlipyPlaceholder', { defaultValue: 'Search KLIPY' })
      : t('chat.giphy.searchPlaceholder', { defaultValue: 'Search GIFs' });
  const gifAttribution =
    gifs.providers.length > 1
      ? t('chat.giphy.poweredByBoth', { defaultValue: 'Powered by GIPHY & KLIPY' })
      : gifs.provider === 'KLIPY'
      ? t('chat.giphy.poweredByKlipy', { defaultValue: 'Powered by KLIPY' })
      : t('chat.giphy.poweredBy', { defaultValue: 'Powered by GIPHY' });

  const showGridLoading =
    (tray.loading && tray.tab !== 'recent') ||
    (tray.tab === 'packs' &&
      tray.isSearching &&
      tray.searchIndexing &&
      tray.searchResults.length === 0) ||
    (!tray.isSearching && tray.tab === 'packs' && tray.packLoading && tray.packStickers.length === 0);
  const recentEmptyLabel = tray.searchQuery.trim()
    ? t('chat.stickers.searchEmpty', { defaultValue: 'No recent media matches' })
    : emptyForTab;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="chat-sticker-tray"
          className={`cap-keyboard-aware-overlay fixed inset-0 z-[100] flex flex-col items-center justify-end ${
            expandToFullHeight ? 'pt-[max(0.5rem,env(safe-area-inset-top))]' : ''
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={panelTransition}
          data-testid="chat-sticker-tray"
          data-expanded={expandToFullHeight ? 'true' : 'false'}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label={t('common.close', { defaultValue: 'Close' })}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('chat.stickers.trayTitle', { defaultValue: 'Stickers and GIFs' })}
            tabIndex={-1}
            className={`relative flex ${chatStickerTrayPanelHeightClass(expandToFullHeight)} w-full max-w-lg flex-col overflow-hidden overscroll-contain rounded-t-[1.75rem] bg-white shadow-2xl outline-none dark:bg-gray-900 ${
              expandToFullHeight
                ? 'pb-2'
                : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            }`}
            initial={{ y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={panelTransition}
          >
            <span
              className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-gray-300 dark:bg-gray-700"
              aria-hidden
            />
            <div className="flex items-center justify-between border-b border-gray-100 px-4 pb-3 pt-5 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Smile size={18} className="text-gray-500 dark:text-gray-400" aria-hidden />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                  {t('chat.stickers.trayTitle', { defaultValue: 'Stickers & GIFs' })}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-800"
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
                  value={tray.tab === 'gifs' ? gifs.query : tray.searchQuery}
                  disabled={tray.tab === 'gifs' && gifs.error === 'unavailable'}
                  onChange={(event) =>
                    tray.tab === 'gifs'
                      ? gifs.setQuery(event.target.value)
                      : tray.setSearchQuery(event.target.value)
                  }
                  onFocus={() => {
                    if (searchBlurTimerRef.current != null) {
                      window.clearTimeout(searchBlurTimerRef.current);
                      searchBlurTimerRef.current = null;
                    }
                    setSearchFocused(true);
                  }}
                  onBlur={() => {
                    searchBlurTimerRef.current = window.setTimeout(() => {
                      setSearchFocused(false);
                      searchBlurTimerRef.current = null;
                    }, 200);
                  }}
                  placeholder={
                    tray.tab === 'gifs'
                      ? gifSearchLabel
                      : t('chat.stickers.searchPlaceholder', {
                          defaultValue: 'Search stickers',
                        })
                  }
                  className="w-full rounded-2xl border border-gray-200 bg-gray-100/80 py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none ring-blue-500 transition focus:bg-white focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-850"
                  data-testid="chat-media-search"
                  aria-label={
                    tray.tab === 'gifs'
                      ? gifSearchLabel
                      : t('chat.stickers.searchPlaceholder', { defaultValue: 'Search stickers' })
                  }
                />
              </label>
            </div>

            <div
              className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-gray-800"
              role="tablist"
              aria-label={t('chat.stickers.tabs', { defaultValue: 'Media sections' })}
            >
              {TABS.map((id) => {
                const selected = tray.tab === id;
                const label =
                  id === 'recent'
                    ? t('chat.stickers.tabRecent', { defaultValue: 'Recent' })
                    : id === 'favorites'
                      ? t('chat.stickers.tabFavorites', { defaultValue: 'Favorites' })
                      : id === 'packs'
                        ? t('chat.stickers.tabPacks', { defaultValue: 'Packs' })
                        : t('chat.stickers.tabGifs', { defaultValue: 'GIFs' });
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    id={`${panelId}-tab-${id}`}
                    aria-controls={`${panelId}-panel`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => tray.setTab(id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                      event.preventDefault();
                      const current = TABS.indexOf(id);
                      const direction = event.key === 'ArrowRight' ? 1 : -1;
                      const next = TABS[(current + direction + TABS.length) % TABS.length];
                      if (!next) return;
                      tray.setTab(next);
                      window.requestAnimationFrame(() =>
                        document.getElementById(`${panelId}-tab-${next}`)?.focus()
                      );
                    }}
                    className={`min-h-11 shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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

            <div
              id={`${panelId}-panel`}
              role="tabpanel"
              aria-labelledby={`${panelId}-tab-${tray.tab}`}
              className="min-h-0 flex-1 overscroll-contain overflow-y-auto"
            >
              {tray.tab === 'gifs' ? (
                gifs.loading && gifs.items.length === 0 ? (
                  <div
                    className="grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))]"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <span className="sr-only">
                      {t('chat.giphy.loading', { defaultValue: 'Loading GIFs' })}
                    </span>
                    {Array.from({ length: 9 }, (_, index) => (
                      <div
                        key={index}
                        className="aspect-square bg-gray-100 motion-safe:animate-pulse dark:bg-gray-800"
                      />
                    ))}
                  </div>
                ) : gifs.error && gifs.items.length === 0 ? (
                  <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500 dark:bg-violet-950/40 dark:text-violet-300">
                      <Clapperboard size={24} aria-hidden />
                    </span>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {gifEmptyLabel}
                    </p>
                    {gifs.error === 'unavailable' ? (
                      <p className="max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                        {t('chat.giphy.unavailableHint', {
                          defaultValue: 'You can still browse and send stickers.',
                        })}
                      </p>
                    ) : null}
                    {gifs.error !== 'unavailable' ? (
                      <button
                        type="button"
                        onClick={gifs.refresh}
                        className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        {t('common.retry', { defaultValue: 'Retry' })}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <GiphySearchGrid
                    items={gifs.items}
                    onSelect={handleSelectGif}
                    busy={busy}
                    emptyLabel={gifEmptyLabel}
                    loadingMore={gifs.loadingMore}
                    loadMoreError={gifs.loadMoreError}
                    hasMore={gifs.hasMore}
                    onLoadMore={gifs.loadMore}
                    onRetryLoadMore={gifs.retryLoadMore}
                  />
                )
              ) : tray.error && tray.tab === 'packs' && tray.packs.length === 0 ? (
                <div className="flex min-h-[8rem] items-center justify-center px-4 text-center text-sm text-red-600 dark:text-red-400">
                  {t('chat.stickers.loadFailed', { defaultValue: 'Could not load stickers' })}
                </div>
              ) : tray.tab === 'packs' && tray.packError && tray.packStickers.length === 0 ? (
                <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('chat.stickers.loadFailed', { defaultValue: 'Could not load stickers' })}
                  </p>
                  <button
                    type="button"
                    onClick={tray.retryPack}
                    className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {t('common.retry', { defaultValue: 'Retry' })}
                  </button>
                </div>
              ) : tray.tab === 'recent' && !tray.prefsReady ? (
                <div
                  className="flex min-h-[16rem] items-center justify-center"
                  aria-busy="true"
                  aria-live="polite"
                >
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                  <span className="sr-only">
                    {t('chat.stickers.loadingRecent', { defaultValue: 'Loading recent media' })}
                  </span>
                </div>
              ) : showGridLoading ? (
                <div className="flex min-h-[8rem] items-center justify-center">
                  <Loader2 className="animate-spin text-gray-400" size={24} />
                </div>
              ) : tray.tab === 'recent' ? (
                <ChatMediaRecentGrid
                  items={tray.recentMedia}
                  stickers={tray.recentStickers}
                  query={tray.searchQuery}
                  busy={busy}
                  emptyLabel={recentEmptyLabel}
                  onSelectSticker={handleSelect}
                  onSelectGif={handleSelectGif}
                  favoriteIds={tray.favoriteIds}
                  onToggleFavorite={tray.toggleFavorite}
                />
              ) : (
                <ChatStickerGrid
                  stickers={
                    tray.isSearching
                      ? tray.searchResults
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
                panelId={`${panelId}-panel`}
              />
            ) : null}
            {tray.tab === 'gifs' ? (
              <p className="px-4 pb-1 pt-2 text-center text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {gifAttribution}
              </p>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
