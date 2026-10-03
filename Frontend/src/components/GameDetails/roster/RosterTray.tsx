import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, Lock, Receipt } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * The organizer / collector tray under the list: Nudge (attendance) and
 * Remind unpaid (cost) side by side, then the money summary. Ordinary players
 * never see it — their settled count lives in their own row.
 */

export interface RosterTrayProps {
  nudge: {
    unanswered: number;
    allowed: boolean;
    remainingHours: number;
    pending: boolean;
    onNudge: () => void;
  } | null;
  remind: {
    disabled: boolean;
    cooldownHours: number | null;
    pending: boolean;
    onRemind: () => void;
  } | null;
  /** `settledLine` is "3 of 4 settled · €10 outstanding" (`cost.summaryStrip`). */
  totals: { total: string | null; settledLine: string } | null;
  frozen: boolean;
  showUpdatedCaption: boolean;
  costError: { retrying: boolean; onRetry: () => void } | null;
}

function TrayButton({
  label,
  badge,
  disabled,
  onClick,
}: {
  label: string;
  badge?: number;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm shadow-gray-900/[0.03] transition-colors hover:bg-gray-50 enabled:active:scale-[0.98] disabled:text-gray-400 disabled:shadow-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:disabled:text-gray-500"
    >
      <BellRing size={14} aria-hidden className="text-primary-600 dark:text-primary-400" />
      {label}
      {badge != null && badge > 0 ? (
        <span className="rounded-full bg-gray-100 px-1.5 py-px text-[11px] tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function RosterTray({
  nudge,
  remind,
  totals,
  frozen,
  showUpdatedCaption,
  costError,
}: RosterTrayProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  if (!nudge && !remind && !totals && !frozen && !costError && !showUpdatedCaption) return null;

  const hints: string[] = [];
  if (nudge && !nudge.allowed) {
    hints.push(t('attendance.organizer.nudgeCooldown', { hours: Math.max(1, nudge.remainingHours) }));
  }
  if (remind?.cooldownHours) hints.push(t('cost.remindCooldown', { hours: remind.cooldownHours }));

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <AnimatePresence initial={false}>
        {showUpdatedCaption ? (
          <motion.p
            key="updated"
            role="status"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
            className="mb-2 text-xs text-gray-500 dark:text-gray-400"
          >
            {t('cost.updatedCaption')}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {nudge || remind ? (
        <div className="flex flex-wrap gap-2">
          {nudge ? (
            <TrayButton
              label={t('attendance.organizer.nudge')}
              badge={nudge.unanswered}
              disabled={!nudge.allowed || nudge.pending}
              onClick={nudge.onNudge}
            />
          ) : null}
          {remind ? (
            <TrayButton
              label={t('cost.remindUnpaid')}
              disabled={remind.disabled || remind.pending}
              onClick={remind.onRemind}
            />
          ) : null}
        </div>
      ) : null}
      {hints.length > 0 ? (
        <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">{hints.join(' · ')}</p>
      ) : null}

      {totals ? (
        <div className={`${nudge || remind ? 'mt-2.5' : ''} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
          <p className="flex items-center gap-1.5 text-xs tabular-nums text-gray-600 dark:text-gray-300">
            <Receipt size={13} aria-hidden className="text-gray-400" />
            {totals.total ? (
              <span className="font-semibold text-gray-900 dark:text-white">
                {t('cost.totalLine', { amount: totals.total })}
              </span>
            ) : null}
          </p>
          <p className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{totals.settledLine}</p>
        </div>
      ) : null}

      {frozen ? (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Lock size={11} aria-hidden />
          {t('cost.frozen')}
        </span>
      ) : null}

      {costError ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p role="alert" className="text-xs text-gray-600 dark:text-gray-400">
            {t('cost.loadFailed')}
          </p>
          <button
            type="button"
            onClick={costError.onRetry}
            disabled={costError.retrying}
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary-600 disabled:opacity-60 dark:text-primary-400"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
