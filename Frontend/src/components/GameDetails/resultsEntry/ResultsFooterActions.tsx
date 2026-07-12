import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Edit, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Game } from '@/types';
import { getRestartText, getFinishText } from '@/utils/gameResultsHelpers';
import type { LoadingState } from '@/hooks/useLoadingState';

interface ResultsFooterActionsProps {
  currentGame: Game | null;
  loading: LoadingState;
  disabled: boolean;
  showFinishButton: boolean;
  showEditButton: boolean;
  showRestartButton: boolean;
  onFinishClick: () => void;
  onEditClick: () => void;
  onRestartClick: () => void;
}

const Spinner = () => (
  <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
);

export const ResultsFooterActions = ({
  currentGame,
  loading,
  disabled,
  showFinishButton,
  showEditButton,
  showRestartButton,
  onFinishClick,
  onEditClick,
  onRestartClick,
}: ResultsFooterActionsProps) => {
  const { t } = useTranslation();

  return (
    <>
      {showFinishButton && (
        <div className="flex justify-center px-4 pt-3">
          <motion.button
            onClick={onFinishClick}
            disabled={loading.saving || disabled}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={loading.saving || disabled ? undefined : { scale: 1.02 }}
            whileTap={loading.saving || disabled ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:from-emerald-600 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-50"
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
        </div>
      )}
      {showEditButton && (
        <div className="flex justify-center px-4 pt-3">
          <motion.button
            onClick={onEditClick}
            disabled={loading.editing || disabled}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={loading.editing || disabled ? undefined : { scale: 1.02 }}
            whileTap={loading.editing || disabled ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            className="inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-sky-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/30 transition-colors hover:from-blue-600 hover:to-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading.editing ? (
              <>
                <Spinner />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <>
                <Edit size={18} className="flex-shrink-0" aria-hidden />
                <span>{t('gameResults.editResults')}</span>
              </>
            )}
          </motion.button>
        </div>
      )}
      {showRestartButton && (
        <div className="flex justify-center gap-2 pt-2">
          <motion.button
            onClick={onRestartClick}
            disabled={loading.restarting || disabled}
            whileTap={loading.restarting || disabled ? undefined : { scale: 0.97 }}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <RotateCcw size={15} className="shrink-0" aria-hidden />
            {loading.restarting ? t('common.loading') : getRestartText(currentGame, t)}
          </motion.button>
        </div>
      )}
    </>
  );
};
