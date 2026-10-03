import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import type { CostShareState } from '@/api/gameCost';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * PRD 348 money, roster-sized: the amount and its state in one pill. For the
 * payer the pill *is* the "received" toggle (role="checkbox") — one control
 * instead of a pill plus a checkbox repeating the same state. Every state
 * carries a text label (visually hidden on the pill, the accessible name on
 * the toggle).
 */

const PILL_TONE: Record<CostShareState, string> = {
  UNPAID: 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-200',
  MARKED_PAID:
    'border border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200',
  SETTLED:
    'border border-green-500 bg-green-50 text-green-800 dark:border-green-500/60 dark:bg-green-500/10 dark:text-green-200',
};

function costStateLabelKey(state: CostShareState): string {
  return state === 'SETTLED'
    ? 'cost.state.settled'
    : state === 'MARKED_PAID'
      ? 'cost.state.markedPaid'
      : 'cost.state.unpaid';
}

export interface MoneyPillToggle {
  /** Whose share — the toggle's accessible name is "Mark {name} as paid". */
  name: string;
  disabled: boolean;
  onChange: (received: boolean) => void;
}

export const MoneyPill = memo(function MoneyPill({
  amount,
  state,
  toggle,
}: {
  amount: string;
  state: CostShareState;
  toggle?: MoneyPillToggle | null;
}) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const settled = state === 'SETTLED';
  const face = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={state}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.92 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
        className={`inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full py-0.5 pe-2 ps-1.5 text-xs font-semibold tabular-nums ${PILL_TONE[state]}`}
      >
        {settled ? (
          <Check size={12} strokeWidth={3} aria-hidden />
        ) : state === 'MARKED_PAID' ? (
          <Clock size={12} aria-hidden />
        ) : (
          // Same 12 px slot as the check / clock icons, so every state is one width.
          <span aria-hidden className="flex h-3 w-3 items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
          </span>
        )}
        {amount}
        <span className="sr-only">{t(costStateLabelKey(state))}</span>
      </motion.span>
    </AnimatePresence>
  );

  if (!toggle) return face;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={settled}
      aria-label={`${t('cost.receivedFor', { name: toggle.name })}: ${amount}, ${t(costStateLabelKey(state))}`}
      disabled={toggle.disabled}
      onClick={() => toggle.onChange(!settled)}
      // The pill stays its visual size; the button grows the touch target to 44 px.
      className="relative inline-flex min-h-11 shrink-0 items-center rounded-full transition-transform enabled:active:scale-95 disabled:opacity-60"
    >
      {face}
    </button>
  );
});
