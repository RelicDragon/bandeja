import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LiveTeamSide } from '@/utils/liveScoring';
import { CourtFlipBounceArrow } from './CourtFlipBounceArrow';

type LiveCourtTeamFlipButtonProps = {
  team: LiveTeamSide;
  onFlip: () => void;
};

const shell =
  'inline-flex min-w-[7.5rem] touch-manipulation items-center justify-center gap-1 rounded-xl border border-primary-300/80 bg-white px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-primary-800 shadow-sm dark:border-primary-600/50 dark:bg-gray-900 dark:text-primary-200';

export function LiveCourtTeamFlipButton({ team, onFlip }: LiveCourtTeamFlipButtonProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const label =
    team === 'teamA' ? t('gameDetails.liveScoring.teamBenchA') : t('gameDetails.liveScoring.teamBenchB');
  const aria =
    team === 'teamA'
      ? t('gameDetails.liveScoring.flipTeamASides')
      : t('gameDetails.liveScoring.flipTeamBSides');

  return (
    <motion.button
      type="button"
      className={shell}
      onClick={onFlip}
      aria-label={aria}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      transition={{ duration: 0.12 }}
    >
      <CourtFlipBounceArrow axis="x" sign={-1} className="inline-flex shrink-0 opacity-70">
        <ChevronLeft size={14} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
      <span className="min-w-0 truncate">{label}</span>
      <CourtFlipBounceArrow axis="x" sign={1} className="inline-flex shrink-0 opacity-70">
        <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
      </CourtFlipBounceArrow>
    </motion.button>
  );
}
