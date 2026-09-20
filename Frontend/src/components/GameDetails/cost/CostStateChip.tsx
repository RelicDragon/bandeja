import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import type { CostShareState } from '@/api/gameCost';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * PRD 348 — the Unpaid / Marked paid / Settled chip.
 *
 * Colour is never the only signal: every chip carries its own text label, and
 * the icons are `aria-hidden` decoration. The 180 ms cross-fade is skipped
 * entirely under `prefers-reduced-motion`.
 */

const TONE: Record<CostShareState, string> = {
  UNPAID:
    'border border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300',
  MARKED_PAID:
    'border border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200',
  SETTLED:
    'border border-green-500 bg-green-50 text-green-800 dark:border-green-500/60 dark:bg-green-500/10 dark:text-green-200',
};

export const CostStateChip = memo(function CostStateChip({
  state,
  className = '',
}: {
  state: CostShareState;
  className?: string;
}) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const label =
    state === 'SETTLED'
      ? t('cost.state.settled')
      : state === 'MARKED_PAID'
        ? t('cost.state.markedPaid')
        : t('cost.state.unpaid');

  return (
    <span className={`relative inline-flex min-h-6 items-center ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state}
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[state]}`}
        >
          {state === 'SETTLED' ? (
            <Check size={12} aria-hidden />
          ) : state === 'MARKED_PAID' ? (
            <Clock size={12} aria-hidden />
          ) : null}
          {label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});
