import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from 'react';

const SCROLL_STEP_VIEWPORT_RATIO = 0.75;

function scrollDownOneViewport(
  scrollRef: RefObject<HTMLElement | null> | undefined,
  reduceMotion: boolean,
) {
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const scrollEl = scrollRef?.current ?? null;

  if (scrollEl) {
    const { scrollTop, scrollHeight, clientHeight } = scrollEl;
    const remaining = scrollHeight - scrollTop - clientHeight;
    const step = Math.min(remaining, clientHeight * SCROLL_STEP_VIEWPORT_RATIO);
    if (step > 0) scrollEl.scrollBy({ top: step, behavior });
    return;
  }

  const scrollTop = window.scrollY;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = window.innerHeight;
  const remaining = scrollHeight - scrollTop - clientHeight;
  const step = Math.min(remaining, clientHeight * SCROLL_STEP_VIEWPORT_RATIO);
  if (step > 0) window.scrollBy({ top: step, behavior });
}
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useHasMoreContentBelow } from '@/hooks/useHasMoreContentBelow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type ScrollMoreBelowHintProps = {
  scrollRef?: RefObject<HTMLElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
};

const hintMotion = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  },
};

function useHintAnchor(scrollRef?: RefObject<HTMLElement | null>) {
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties | null>(null);

  const updateAnchor = useCallback(() => {
    const scrollEl = scrollRef?.current ?? null;
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      setAnchorStyle({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.bottom,
      });
      return;
    }
    setAnchorStyle({
      left: 0,
      width: window.innerWidth,
      bottom: 0,
    });
  }, [scrollRef]);

  useEffect(() => {
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, { passive: true });

    const scrollEl = scrollRef?.current ?? null;
    scrollEl?.addEventListener('scroll', updateAnchor, { passive: true });

    const ro = new ResizeObserver(updateAnchor);
    if (scrollEl) ro.observe(scrollEl);
    ro.observe(document.documentElement);

    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor);
      scrollEl?.removeEventListener('scroll', updateAnchor);
      ro.disconnect();
    };
  }, [scrollRef, updateAnchor]);

  return anchorStyle;
}

export const ScrollMoreBelowHint = ({
  scrollRef,
  contentRef,
  enabled = true,
}: ScrollMoreBelowHintProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const hasMoreBelow = useHasMoreContentBelow({ scrollRef, contentRef, enabled });
  const anchorStyle = useHintAnchor(scrollRef);
  const scrollLabel = t('gameDetails.scrollMoreBelow', { defaultValue: 'More content below' });

  const handleScrollDown = useCallback(() => {
    scrollDownOneViewport(scrollRef, reduceMotion);
  }, [scrollRef, reduceMotion]);

  if (typeof document === 'undefined' || !anchorStyle) return null;

  return createPortal(
    <AnimatePresence>
      {hasMoreBelow ? (
        <motion.div
          key="scroll-more-below-hint"
          className="pointer-events-none z-[45] flex justify-center"
          style={{
            position: 'fixed',
            ...anchorStyle,
          }}
          initial={reduceMotion ? false : hintMotion.initial}
          animate={reduceMotion ? { opacity: 1 } : hintMotion.animate}
          exit={reduceMotion ? { opacity: 0 } : hintMotion.exit}
        >
          <div className="relative h-16 w-full max-w-2xl bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 dark:to-transparent">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
              <motion.button
                type="button"
                onClick={handleScrollDown}
                className="pointer-events-auto flex items-center justify-center rounded-full bg-white/90 p-1 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800/90 dark:ring-gray-700/80"
                title={scrollLabel}
                aria-label={scrollLabel}
                animate={reduceMotion ? undefined : { y: [0, 5, 0] }}
                transition={
                  reduceMotion
                    ? undefined
                    : { repeat: Infinity, duration: 1.35, ease: 'easeInOut' }
                }
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              >
                <ChevronDown
                  size={20}
                  strokeWidth={2.25}
                  className="text-gray-600 dark:text-gray-300"
                  aria-hidden
                />
              </motion.button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
