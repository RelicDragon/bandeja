import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CourtFlipBounceArrow } from './CourtFlipBounceArrow';

type LiveCourtEndsFlipRailProps = {
  side: 'left' | 'right';
  onFlip: () => void;
};

const shell =
  'flex w-9 shrink-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl border border-primary-300/80 bg-white px-0.5 py-2 text-primary-800 shadow-sm dark:border-primary-600/50 dark:bg-gray-900 dark:text-primary-200';

export function LiveCourtEndsFlipRail({ side, onFlip }: LiveCourtEndsFlipRailProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const label = t('gameDetails.liveScoring.flipCourtVertical');
  const textClass =
    side === 'left'
      ? 'text-[9px] font-bold uppercase leading-tight tracking-wide [writing-mode:vertical-rl] rotate-180'
      : 'text-[9px] font-bold uppercase leading-tight tracking-wide [writing-mode:vertical-lr]';

  return (
    <motion.button
      type="button"
      className={`${shell} self-stretch`}
      onClick={onFlip}
      aria-label={label}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
    >
      <CourtFlipBounceArrow axis="y" sign={1} className="inline-flex shrink-0 opacity-60">
        <ChevronUp size={12} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
      <span className={textClass}>{label}</span>
      <CourtFlipBounceArrow axis="y" sign={-1} className="inline-flex shrink-0 opacity-60">
        <ChevronDown size={12} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
    </motion.button>
  );
}
