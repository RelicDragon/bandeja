import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Cast, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

type LiveScoringUrlButtonsProps = {
  tvUrl: string;
  broadcastUrl: string;
};

const anchorStyle = {
  bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
  right: 'max(0.75rem, env(safe-area-inset-right))',
} as const;

const mainBtn =
  'flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full border border-gray-300/90 bg-white/95 text-gray-900 shadow-lg backdrop-blur-sm transition-colors hover:bg-gray-50 active:scale-[0.97] dark:border-gray-600/90 dark:bg-gray-900/95 dark:text-gray-100 dark:hover:bg-gray-800';

const actionBtn =
  'flex h-11 shrink-0 touch-manipulation items-center gap-2 rounded-full border border-gray-300/90 bg-white/95 px-3.5 text-xs font-semibold text-gray-900 shadow-md backdrop-blur-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-600/90 dark:bg-gray-900/95 dark:text-gray-100 dark:hover:bg-gray-800';

const popTransition = { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.75 };

export function LiveScoringUrlButtons({ tvUrl, broadcastUrl }: LiveScoringUrlButtonsProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const copy = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('gameDetails.linkCopied'));
    } catch {
      toast.error(t('gameDetails.copyError'));
    }
  };

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, x: 14, scale: 0.88 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: 14, scale: 0.88 },
        transition: popTransition,
      };

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed z-50 flex items-center gap-2"
      style={anchorStyle}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key="share-actions"
            className="pointer-events-auto flex items-center gap-2"
            initial={reduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
          >
            {tvUrl ? (
              <motion.button
                type="button"
                className={actionBtn}
                aria-label={t('gameDetails.liveScoreTv')}
                {...motionProps}
                transition={{ ...popTransition, delay: reduceMotion ? 0 : 0.04 }}
                onClick={() => void copy(tvUrl)}
              >
                <Tv className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                <span>{t('gameDetails.liveScoreTv')}</span>
              </motion.button>
            ) : null}
            {broadcastUrl ? (
              <motion.button
                type="button"
                className={actionBtn}
                aria-label={t('gameDetails.liveScoreBroadcast')}
                {...motionProps}
                transition={{ ...popTransition, delay: reduceMotion ? 0 : 0.08 }}
                onClick={() => void copy(broadcastUrl)}
              >
                <Cast className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                <span>{t('gameDetails.liveScoreBroadcast')}</span>
              </motion.button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.button
        type="button"
        className={`pointer-events-auto ${mainBtn}`}
        aria-expanded={open}
        aria-label={t('gameDetails.liveScoreTv')}
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
      >
        <Tv className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </motion.button>
    </div>
  );
}
