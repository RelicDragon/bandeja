import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { MonthlyRecapCard } from '@/api/recap';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useRecapFormatters } from '@/features/recap/recapFormat';
import { RECAP_BUBBLE_RING_CLASS } from '@/components/stories/slides/recapSlideTheme';

/**
 * PRD 353 — the recap bubble at the front of the story rail.
 *
 * A sky → violet gradient ring instead of the usual story ring, so it reads as
 * "not a story from a person". It pulses once on first appearance and then
 * stays still; reduced motion skips the pulse entirely.
 */

export interface RecapRailBubbleProps {
  recap: MonthlyRecapCard;
  onClick: (monthKey: string) => void;
}

export const RecapRailBubble = ({ recap, onClick }: RecapRailBubbleProps) => {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const reduceMotion = usePrefersReducedMotion();
  const label = t('recap.rail.label', { month: formatters.monthShort(recap.monthStart) });

  return (
    <button
      type="button"
      onClick={() => onClick(recap.monthKey)}
      aria-label={t('recap.rail.aria', {
        month: formatters.monthLong(recap.monthStart),
      })}
      className="flex min-h-11 min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
    >
      <motion.span
        className={`block overflow-hidden rounded-full ${RECAP_BUBBLE_RING_CLASS}`}
        initial={reduceMotion ? false : { scale: 0.94 }}
        animate={reduceMotion ? { scale: 1 } : { scale: [0.94, 1.06, 1] }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }}
      >
        <span className="block rounded-full bg-white p-[2px] dark:bg-gray-900">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-white">
            <Sparkles className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </span>
        </span>
      </motion.span>
      <span className="max-w-[4.5rem] truncate text-[11px] font-semibold leading-tight text-gray-900 dark:text-white">
        {label}
      </span>
    </button>
  );
};
