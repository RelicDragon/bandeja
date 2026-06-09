import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useScrollOverflowEdges } from '@/hooks/useScrollOverflowEdges';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type ScrollEdgeHintsProps = {
  scrollRef?: RefObject<HTMLElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
};

const bottomHintMotion = {
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

const topHintMotion = {
  initial: { opacity: 0, y: -12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.22, ease: [0.4, 0, 1, 1] as const },
  },
};

function scrollToTop(
  scrollRef: RefObject<HTMLElement | null> | undefined,
  reduceMotion: boolean,
) {
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const scrollEl = scrollRef?.current ?? null;
  if (scrollEl) {
    scrollEl.scrollTo({ top: 0, behavior });
    return;
  }
  window.scrollTo({ top: 0, behavior });
}

function scrollToBottom(
  scrollRef: RefObject<HTMLElement | null> | undefined,
  reduceMotion: boolean,
) {
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const scrollEl = scrollRef?.current ?? null;

  if (scrollEl) {
    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior });
    return;
  }

  window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
}

function useBottomHintAnchor(scrollRef?: RefObject<HTMLElement | null>) {
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

function readWindowTopInset(): number {
  const header = document.querySelector('header');
  if (!header) return 0;
  return header.getBoundingClientRect().bottom;
}

function useTopHintAnchor(scrollRef?: RefObject<HTMLElement | null>) {
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties | null>(null);

  const updateAnchor = useCallback(() => {
    const scrollEl = scrollRef?.current ?? null;
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      setAnchorStyle({
        left: rect.left,
        width: rect.width,
        top: rect.top,
      });
      return;
    }
    setAnchorStyle({
      left: 0,
      width: window.innerWidth,
      top: readWindowTopInset(),
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

export const ScrollEdgeHints = ({
  scrollRef,
  contentRef,
  enabled = true,
}: ScrollEdgeHintsProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const { hasMoreAbove, hasMoreBelow } = useScrollOverflowEdges({ scrollRef, contentRef, enabled });
  const bottomAnchor = useBottomHintAnchor(scrollRef);
  const topAnchor = useTopHintAnchor(scrollRef);
  const belowLabel = t('gameDetails.scrollMoreBelow', { defaultValue: 'More content below' });
  const aboveLabel = t('gameDetails.scrollMoreAbove', { defaultValue: 'More content above' });

  const handleScrollDown = useCallback(() => {
    scrollToBottom(scrollRef, reduceMotion);
  }, [scrollRef, reduceMotion]);

  const handleScrollUp = useCallback(() => {
    scrollToTop(scrollRef, reduceMotion);
  }, [scrollRef, reduceMotion]);

  if (typeof document === 'undefined' || !bottomAnchor || !topAnchor) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {hasMoreAbove ? (
          <motion.div
            key="scroll-more-above-hint"
            className="pointer-events-none z-[45] flex justify-center"
            style={{
              position: 'fixed',
              ...topAnchor,
            }}
            initial={reduceMotion ? false : topHintMotion.initial}
            animate={reduceMotion ? { opacity: 1 } : topHintMotion.animate}
            exit={reduceMotion ? { opacity: 0 } : topHintMotion.exit}
          >
            <div className="relative h-16 w-full max-w-2xl bg-gradient-to-b from-gray-50 via-gray-50/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 dark:to-transparent">
              <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
                <motion.button
                  type="button"
                  onClick={handleScrollUp}
                  className="pointer-events-auto flex items-center justify-center rounded-full bg-white/90 p-1 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800/90 dark:ring-gray-700/80"
                  title={aboveLabel}
                  aria-label={aboveLabel}
                  animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
                  transition={
                    reduceMotion
                      ? undefined
                      : { repeat: Infinity, duration: 1.35, ease: 'easeInOut' }
                  }
                  whileTap={reduceMotion ? undefined : { scale: 0.92 }}
                >
                  <ChevronUp
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
      </AnimatePresence>
      <AnimatePresence>
        {hasMoreBelow ? (
          <motion.div
            key="scroll-more-below-hint"
            className="pointer-events-none z-[45] flex justify-center"
            style={{
              position: 'fixed',
              ...bottomAnchor,
            }}
            initial={reduceMotion ? false : bottomHintMotion.initial}
            animate={reduceMotion ? { opacity: 1 } : bottomHintMotion.animate}
            exit={reduceMotion ? { opacity: 0 } : bottomHintMotion.exit}
          >
            <div className="relative h-16 w-full max-w-2xl bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 dark:to-transparent">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                <motion.button
                  type="button"
                  onClick={handleScrollDown}
                  className="pointer-events-auto flex items-center justify-center rounded-full bg-white/90 p-1 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800/90 dark:ring-gray-700/80"
                  title={belowLabel}
                  aria-label={belowLabel}
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
      </AnimatePresence>
    </>,
    document.body,
  );
};

/** @deprecated Use ScrollEdgeHints */
export const ScrollMoreBelowHint = ScrollEdgeHints;
