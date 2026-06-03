import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CourtFlipBounceArrow } from './CourtFlipBounceArrow';

type LiveCourtEndsFlipRailProps = {
  side: 'left' | 'right';
  onFlip: () => void;
  className?: string;
};

const shell =
  'flex w-7 shrink-0 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-primary-500 bg-primary-100 px-0.5 py-1 text-primary-950 shadow-md ring-2 ring-primary-400/40 dark:border-primary-400 dark:bg-primary-950/70 dark:text-primary-50 dark:ring-primary-500/30';

export function LiveCourtEndsFlipRail({ side, onFlip, className }: LiveCourtEndsFlipRailProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const label = t('gameDetails.liveScoring.flipCourtVertical');
  const textClass =
    side === 'left'
      ? 'text-[9px] font-extrabold uppercase leading-tight tracking-wide [writing-mode:vertical-rl] rotate-180'
      : 'text-[9px] font-extrabold uppercase leading-tight tracking-wide [writing-mode:vertical-lr]';

  return (
    <motion.button
      type="button"
      className={className ? `${shell} ${className}` : shell}
      onClick={onFlip}
      aria-label={label}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
    >
      <CourtFlipBounceArrow axis="y" sign={1} className="inline-flex shrink-0 text-primary-700 dark:text-primary-200">
        <ChevronUp size={12} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
      <span className={textClass}>{label}</span>
      <CourtFlipBounceArrow axis="y" sign={-1} className="inline-flex shrink-0 text-primary-700 dark:text-primary-200">
        <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
    </motion.button>
  );
}
