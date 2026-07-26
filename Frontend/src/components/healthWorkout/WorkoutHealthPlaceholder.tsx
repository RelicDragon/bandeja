import { AlertCircle, Watch } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type WorkoutHealthPlaceholderProps = {
  variant: 'empty' | 'error';
  context: 'game' | 'profile';
  onRetry?: () => void;
  className?: string;
};

export const WorkoutHealthPlaceholder = ({
  variant,
  context,
  onRetry,
  className = '',
}: WorkoutHealthPlaceholderProps) => {
  const { t } = useTranslation();
  const isError = variant === 'error';
  const isGame = context === 'game';

  const titleKey = isError
    ? isGame
      ? 'healthWorkout.loadError'
      : 'healthWorkout.loadErrorProfile'
    : isGame
      ? 'healthWorkout.emptyGameTitle'
      : 'healthWorkout.emptyProfileTitle';

  const hintKey = isError
    ? isGame
      ? 'healthWorkout.loadErrorHint'
      : 'healthWorkout.loadErrorProfileHint'
    : isGame
      ? 'healthWorkout.emptyGameHint'
      : 'healthWorkout.emptyProfileHint';

  const shell = isError
    ? 'border border-rose-200/90 bg-rose-50/70 dark:border-rose-900/45 dark:bg-rose-950/30'
    : 'border-2 border-dashed border-gray-300 bg-gray-50/90 dark:border-gray-500 dark:bg-gray-800/45';

  const iconWrap = isError
    ? 'bg-rose-100 dark:bg-rose-900/50'
    : 'bg-gray-200/80 dark:bg-gray-700/80';

  return (
    <div className={`rounded-xl ${shell} ${className}`.trim()}>
      <div className="flex items-start gap-3.5 px-4 py-4">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconWrap}`}
          aria-hidden
        >
          {isError ? (
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          ) : (
            <Watch className="h-5 w-5 text-gray-600 dark:text-gray-300" strokeWidth={1.75} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
            {t(titleKey)}
          </p>
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            {t(hintKey)}
          </p>
          {isError && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 inline-flex items-center justify-center rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
