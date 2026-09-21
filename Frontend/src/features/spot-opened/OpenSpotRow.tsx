import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface OpenSpotRowProps {
  /** Staggers the fade so several freed seats do not flash as one block. */
  index?: number;
  className?: string;
}

/**
 * PRD 347 — the empty PLAYING slot in the roster list: a dashed outline reading
 * "Open spot", faded in over 400 ms.
 *
 * Shown to everyone, not only to people who can invite — the point is that the
 * roster visibly has a hole in it, which is what makes the "spot opened" pill on
 * the card mean something when you arrive from it.
 */
export const OpenSpotRow = ({ index = 0, className = '' }: OpenSpotRowProps) => {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, delay: index * 0.05 }}
      className={`flex min-h-11 items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-transparent p-2.5 dark:border-gray-600 ${className}`.trim()}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500"
        aria-hidden
      >
        <UserRound size={16} />
      </span>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {t('spots.roster.openSpot')}
      </span>
    </motion.div>
  );
};
