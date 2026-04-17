import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { ReactionEmojiCatalog } from '@/components/reactions/ReactionEmojiCatalog';
import {
  REACTION_PICKER_FREQUENT_STRIP_COUNT,
  REACTION_EMOJI_PICKER_PORTAL_ATTR,
  REACTION_PICKER_STRIP_IDLE_FRAME,
  REACTION_PICKER_STRIP_SELECTED_INNER_FRAME,
} from '@/components/reactions/reactionPickerTypes';
import { isValidReactionEmoji, normalizeReactionEmoji } from '@/utils/validateReactionEmoji';

function interactionOriginatedInEmojiMartShadow(detail: { originalEvent: Event }): boolean {
  const ev = detail.originalEvent;
  const path =
    'composedPath' in ev && typeof (ev as PointerEvent & { composedPath?: () => EventTarget[] }).composedPath === 'function'
      ? (ev as PointerEvent).composedPath()
      : null;
  if (!path) return false;
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.tagName === 'EM-EMOJI-PICKER' || node.hasAttribute('data-reaction-catalog-root')) return true;
  }
  return false;
}

function usePrefersReducedMotion(): boolean {
  return useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}

function useHtmlDarkClass(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof document === 'undefined') return () => {};
      const el = document.documentElement;
      const obs = new MutationObserver(() => onStoreChange());
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => (typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false),
    () => false
  );
}

export type ReactionEmojiPickSource = 'strip' | 'catalog';

export type EmojiQuickStripProps = {
  frequentEmojis: readonly string[];
  currentEmoji?: string | null;
  onPick: (emoji: string, source: ReactionEmojiPickSource) => void;
  disabled?: boolean;
};

export function EmojiQuickStrip({ frequentEmojis, currentEmoji, onPick, disabled }: EmojiQuickStripProps) {
  const { t, i18n } = useTranslation();
  const [catalogOpen, setCatalogOpen] = useState(false);
  const reduceMotion = usePrefersReducedMotion();
  const isDark = useHtmlDarkClass();
  const martTheme: 'light' | 'dark' | 'auto' = isDark ? 'dark' : 'light';

  const onCatalogOpenChange = useCallback((open: boolean) => {
    setCatalogOpen(open);
  }, []);

  const handleStripPick = useCallback(
    (emoji: string) => {
      const normalized = normalizeReactionEmoji(emoji);
      if (!isValidReactionEmoji(normalized)) return;
      onPick(normalized, 'strip');
    },
    [onPick]
  );

  const handleCatalogEmojiSelect = useCallback(
    (emoji: string) => {
      const normalized = normalizeReactionEmoji(emoji);
      if (!isValidReactionEmoji(normalized)) return;
      setCatalogOpen(false);
      window.setTimeout(() => onPick(normalized, 'catalog'), 0);
    },
    [onPick]
  );

  const onCatalogInteractOutside = useCallback((e: CustomEvent<{ originalEvent: Event }>) => {
    if (interactionOriginatedInEmojiMartShadow(e.detail)) e.preventDefault();
  }, []);

  const normCurrent = useMemo(
    () => (currentEmoji ? normalizeReactionEmoji(currentEmoji) : ''),
    [currentEmoji]
  );

  const stripEmojis = useMemo(() => {
    const list = [...frequentEmojis];
    if (!normCurrent || !isValidReactionEmoji(normCurrent)) return list;
    const inStrip = list.some((e) => normalizeReactionEmoji(e) === normCurrent);
    if (inStrip) return list;
    if (list.length >= REACTION_PICKER_FREQUENT_STRIP_COUNT) {
      list[REACTION_PICKER_FREQUENT_STRIP_COUNT - 1] = normCurrent;
      return list;
    }
    return [...list, normCurrent];
  }, [frequentEmojis, normCurrent]);

  const stripNormSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of stripEmojis) s.add(normalizeReactionEmoji(e));
    return s;
  }, [stripEmojis]);
  const highlightMore = Boolean(normCurrent && !stripNormSet.has(normCurrent));

  const freqBtn =
    'relative flex size-12 items-center justify-center justify-self-center rounded-lg text-xl leading-none transition-colors hover:bg-gray-100 dark:hover:bg-gray-700';

  const moreBtn = `flex size-12 items-center justify-center justify-self-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 ${catalogOpen ? 'bg-gray-100 dark:bg-gray-700' : ''}`;

  const chevronClass = reduceMotion ? '' : 'transition-transform duration-200';

  const overlayMotion = reduceMotion ? '' : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0';

  const stripGrid = useMemo(() => {
    const totalCells = stripEmojis.length + 1;
    const colCount = Math.max(1, Math.ceil(totalCells / 2));
    const rowCount = Math.max(1, Math.ceil(totalCells / colCount));
    return {
      gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rowCount}, auto)`,
    };
  }, [stripEmojis.length]);

  return (
    <DialogPrimitive.Root modal={false} open={catalogOpen} onOpenChange={onCatalogOpenChange}>
      <div
        className="grid w-full min-w-0 gap-1 py-0.5"
        style={{
          gridTemplateColumns: stripGrid.gridTemplateColumns,
          gridTemplateRows: stripGrid.gridTemplateRows,
        }}
      >
        {stripEmojis.map((emoji, i) => {
          const selected = Boolean(normCurrent && normalizeReactionEmoji(emoji) === normCurrent);
          return (
            <button
              key={`${normalizeReactionEmoji(emoji)}-${i}`}
              type="button"
              disabled={disabled}
              aria-label={t('chat.reactions.reactWith', { emoji })}
              title={t('chat.reactions.reactWith', { emoji })}
              aria-selected={selected}
              onClick={() => handleStripPick(emoji)}
              className={`${freqBtn} ${REACTION_PICKER_STRIP_IDLE_FRAME} disabled:opacity-50`}
            >
              <span
                className={`select-none leading-none inline-flex items-center justify-center ${
                  selected ? `${REACTION_PICKER_STRIP_SELECTED_INNER_FRAME} p-1` : ''
                }`}
              >
                {emoji}
              </span>
            </button>
          );
        })}
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-expanded={catalogOpen}
            aria-haspopup="dialog"
            aria-label={t('chat.reactions.moreReactions')}
            title={t('chat.reactions.moreReactions')}
            className={`${moreBtn} ${REACTION_PICKER_STRIP_IDLE_FRAME} disabled:opacity-50`}
          >
            <span
              className={`inline-flex items-center justify-center ${
                highlightMore ? `${REACTION_PICKER_STRIP_SELECTED_INNER_FRAME} p-0.5` : ''
              }`}
            >
              <ChevronDown
                size={22}
                strokeWidth={2}
                className={`${chevronClass} ${catalogOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </span>
          </button>
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <div {...{ [REACTION_EMOJI_PICKER_PORTAL_ATTR]: '' }} className="pointer-events-none fixed inset-0 z-[10035]">
          <div
            role="presentation"
            aria-hidden
            className={`pointer-events-auto fixed inset-0 z-[10040] bg-black/50 ${overlayMotion}`}
            onPointerDown={(e) => {
              e.preventDefault();
              onCatalogOpenChange(false);
            }}
          />
          <DialogPrimitive.Content
            className="pointer-events-auto fixed left-[50%] top-[50%] z-[10050] flex max-h-[min(88vh,560px)] w-[min(96vw,420px)] max-w-[96vw] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl focus:outline-none dark:border-gray-700 dark:bg-gray-900"
            onPointerDownOutside={onCatalogInteractOutside}
            onInteractOutside={onCatalogInteractOutside}
          >
            <div className="flex items-center gap-2 border-b border-gray-200 px-2 py-2 dark:border-gray-700 sm:px-3">
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  aria-label={t('chat.contextMenu.back', { defaultValue: 'Back' })}
                >
                  <ChevronLeft size={22} strokeWidth={2} aria-hidden />
                </button>
              </DialogPrimitive.Close>
              <DialogPrimitive.Title className="min-w-0 flex-1 text-base font-semibold text-gray-900 dark:text-white">
                {t('chat.reactions.chooseReaction')}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Description className="sr-only">
              {t('chat.reactions.catalogDescription', {
                defaultValue: 'Search or browse categories, then choose an emoji.',
              })}
            </DialogPrimitive.Description>
            <ReactionEmojiCatalog
              i18nLang={i18n.language}
              theme={martTheme}
              onSelect={handleCatalogEmojiSelect}
              previewNative={normCurrent && isValidReactionEmoji(normCurrent) ? normCurrent : null}
            />
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
