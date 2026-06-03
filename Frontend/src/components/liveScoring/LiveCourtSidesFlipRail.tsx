import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CourtFlipBounceArrow } from './CourtFlipBounceArrow';

type LiveCourtSidesFlipRailProps = {
  side: 'left' | 'right';
  onFlip: () => void;
};

const shell =
  'flex h-9 shrink-0 touch-manipulation flex-row items-center justify-center gap-1 rounded-xl border-2 border-primary-500 bg-primary-100 px-2 py-0.5 text-primary-950 shadow-md ring-2 ring-primary-400/40 dark:border-primary-400 dark:bg-primary-950/70 dark:text-primary-50 dark:ring-primary-500/30';

export function LiveCourtSidesFlipRail({ side, onFlip }: LiveCourtSidesFlipRailProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const label = t('gameDetails.liveScoring.flipCourtHorizontal');

  return (
    <motion.button
      type="button"
      className={`${shell} w-full max-w-[5.5rem]`}
      onClick={onFlip}
      aria-label={label}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
    >
      {side === 'left' ? (
        <CourtFlipBounceArrow axis="x" sign={-1} className="inline-flex shrink-0 text-primary-700 dark:text-primary-200">
          <ChevronLeft size={12} strokeWidth={2.5} aria-hidden />
        </CourtFlipBounceArrow>
      ) : null}
      <span className="text-[9px] font-extrabold uppercase leading-tight tracking-wide">{label}</span>
      {side === 'right' ? (
        <CourtFlipBounceArrow axis="x" sign={1} className="inline-flex shrink-0 text-primary-700 dark:text-primary-200">
          <ChevronRight size={12} strokeWidth={2.5} aria-hidden />
        </CourtFlipBounceArrow>
      ) : null}
    </motion.button>
  );
}
