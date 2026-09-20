import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { ShopItem } from '@/api/shop';
import { ShopItemPreview } from './ShopItemPreview';
import {
  SHOP_PREVIEW_CONTEXTS,
  SHOP_PREVIEW_ROTATION_MS,
  nextPreviewContext,
  type ShopPreviewContext,
} from './shopFormat';

/**
 * PRD 355 — the item sheet's hero preview.
 *
 * Rotates profile → roster row → chat every 2 s with a crossfade. Tapping the
 * preview pauses it (and the state is announced), and under reduced motion it
 * never rotates at all: the profile context is shown and the control is hidden,
 * because there is nothing to pause.
 */
interface ShopRotatingPreviewProps {
  item: ShopItem;
  /** Freeze on the current frame, e.g. while a confirm dialog is open. */
  paused?: boolean;
  className?: string;
}

export const ShopRotatingPreview = ({ item, paused = false, className = '' }: ShopRotatingPreviewProps) => {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const [context, setContext] = useState<ShopPreviewContext>(SHOP_PREVIEW_CONTEXTS[0]);
  const [userPaused, setUserPaused] = useState(false);

  const frozen = reducedMotion || paused || userPaused;

  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(() => {
      setContext((current) => nextPreviewContext(current));
    }, SHOP_PREVIEW_ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [frozen]);

  // A different item starts its story from the top.
  useEffect(() => {
    setContext(SHOP_PREVIEW_CONTEXTS[0]);
  }, [item.id]);

  const shown = reducedMotion ? SHOP_PREVIEW_CONTEXTS[0] : context;

  return (
    <div className={`relative rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60 ${className}`}>
      <div className="relative min-h-[120px]">
        {reducedMotion ? (
          <ShopItemPreview item={item} context={shown} size="lg" />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shown}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <ShopItemPreview item={item} context={shown} size="lg" />
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {reducedMotion ? null : (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {SHOP_PREVIEW_CONTEXTS.map((candidate) => (
              <span
                key={candidate}
                className={`h-1.5 w-1.5 rounded-full ${
                  candidate === shown ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setUserPaused((value) => !value)}
            aria-pressed={userPaused}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {userPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            {userPaused ? t('shop.resumePreview') : t('shop.pausePreview')}
          </button>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {t(`shop.previewContext.${shown}`)}
      </p>
    </div>
  );
};
