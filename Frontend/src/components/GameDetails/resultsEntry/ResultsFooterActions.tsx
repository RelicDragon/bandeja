import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Game } from '@/types';
import { getFinishText, getRestartText } from '@/utils/gameResultsHelpers';
import type { LoadingState } from '@/hooks/useLoadingState';

interface ResultsFooterActionsProps {
  currentGame: Game | null;
  loading: LoadingState;
  disabled: boolean;
  showFinishButton: boolean;
  showRestartButton: boolean;
  progress: { finished: number; total: number };
  onFinishClick: () => void;
  onRestartClick: () => void;
}

const Spinner = () => (
  <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
);

/**
 * Finish and Restart stay in reach while scoring: the bar sticks to the bottom
 * of the viewport for as long as the results board is on screen. Restart is
 * there from the first moment of entry — before any match is ready to finish —
 * so a scorer can always back out to game setup. Beside the progress line it
 * stays compact and away from Finish; alone it takes the whole bar. Edit
 * (after finishing) lives in the ⋯ menu beside the results tabs.
 */
export const ResultsFooterActions = ({
  currentGame,
  loading,
  disabled,
  showFinishButton,
  showRestartButton,
  progress,
  onFinishClick,
  onRestartClick,
}: ResultsFooterActionsProps) => {
  const { t } = useTranslation();

  if (!showFinishButton && !showRestartButton) return null;

  const percent = progress.total > 0 ? Math.round((progress.finished / progress.total) * 100) : 0;
  const complete = progress.total > 0 && progress.finished === progress.total;
  const finishDisabled = loading.saving || loading.restarting || disabled;
  const restartDisabled = finishDisabled || loading.editing;
  const restartText = getRestartText(currentGame, t);

  return (
    <div className="sticky bottom-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="mx-auto max-w-md rounded-2xl border border-gray-200/80 bg-white/95 p-3 shadow-[0_-6px_24px_-10px_rgba(0,0,0,0.25)] backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-800/95"
      >
        {showFinishButton ? (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-baseline gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                <span className="truncate">
                  {t('gameResults.matchesScoredProgress', { scored: progress.finished, total: progress.total })}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">{percent}%</span>
              </div>
              {showRestartButton ? (
                <button
                  type="button"
                  onClick={onRestartClick}
                  disabled={restartDisabled}
                  aria-label={restartText}
                  title={restartText}
                  className="-my-2 -me-1.5 inline-flex h-9 max-w-[50%] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                >
                  <RotateCcw size={14} className="shrink-0" aria-hidden />
                  <span className="truncate">
                    {loading.restarting ? t('common.loading') : t('gameResults.restart')}
                  </span>
                </button>
              ) : null}
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
              disabled={finishDisabled}
              whileTap={finishDisabled ? undefined : { scale: 0.97 }}
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
          </>
        ) : (
          <motion.button
            type="button"
            onClick={onRestartClick}
            disabled={restartDisabled}
            whileTap={restartDisabled ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          >
            <RotateCcw size={16} className="shrink-0" aria-hidden />
            <span className="truncate">{loading.restarting ? t('common.loading') : restartText}</span>
          </motion.button>
        )}
      </motion.div>
    </div>
  );
};
