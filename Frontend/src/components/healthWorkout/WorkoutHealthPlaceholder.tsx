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
    ? 'border-rose-200/90 bg-rose-50/70 dark:border-rose-900/45 dark:bg-rose-950/30'
    : 'border-dashed border-gray-200 bg-gray-50/90 dark:border-gray-600 dark:bg-gray-800/45';

  if (isError) {
    return (
      <div className={`rounded-xl border p-4 ${shell} ${className}`.trim()}>
        <div className="flex gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50"
            aria-hidden
          >
            <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(titleKey)}</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{t(hintKey)}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
              >
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${shell} ${className}`.trim()}>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t(titleKey)}</p>
      <div className="mt-3 flex gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200/90 dark:bg-gray-700"
          aria-hidden
        >
          <Watch className="h-5 w-5 text-gray-700 dark:text-gray-300" strokeWidth={1.75} />
        </div>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{t(hintKey)}</p>
      </div>
    </div>
  );
};
