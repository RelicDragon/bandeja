import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Game } from '@/types';
import { getFinishText } from '@/utils/gameResultsHelpers';
import type { LoadingState } from '@/hooks/useLoadingState';

interface ResultsFooterActionsProps {
  currentGame: Game | null;
  loading: LoadingState;
  disabled: boolean;
  showFinishButton: boolean;
  progress: { finished: number; total: number };
  onFinishClick: () => void;
}

const Spinner = () => (
  <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
);

/**
 * Finish stays in reach while scoring: it sticks to the bottom of the viewport
 * for as long as the results board is on screen. Edit / reset live in the ⋯
 * menu beside the results tabs, away from this button.
 */
export const ResultsFooterActions = ({
  currentGame,
  loading,
  disabled,
  showFinishButton,
  progress,
  onFinishClick,
}: ResultsFooterActionsProps) => {
  const { t } = useTranslation();

  if (!showFinishButton) return null;

  const percent = progress.total > 0 ? Math.round((progress.finished / progress.total) * 100) : 0;
  const complete = progress.total > 0 && progress.finished === progress.total;

  return (
    <div className="sticky bottom-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="mx-auto max-w-md rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-[0_-6px_24px_-10px_rgba(0,0,0,0.25)] backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-800/95"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
          <span className="truncate">
            {t('gameResults.matchesScoredProgress', { scored: progress.finished, total: progress.total })}
          </span>
          <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">{percent}%</span>
        </div>
        <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <motion.div
            className={`h-full rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
            initial={false}
            animate={{ width: `${percent}%` }}
            transition={{ type: 'spring', stiffness: 220, damping: 28 }}
          />
        </div>
        <motion.button
          type="button"
          onClick={onFinishClick}
          disabled={loading.saving || disabled}
          whileTap={loading.saving || disabled ? undefined : { scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 24 }}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-6 text-base font-semibold text-white shadow-md shadow-emerald-500/25 transition-colors hover:from-emerald-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading.saving ? (
            <>
              <Spinner />
              <span>{t('common.loading')}</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={20} className="flex-shrink-0" aria-hidden />
              <span>{getFinishText(currentGame, t)}</span>
            </>
          )}
        </motion.button>
      </motion.div>
    </div>
  );
};
