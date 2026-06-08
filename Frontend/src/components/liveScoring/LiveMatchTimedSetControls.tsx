import { useTranslation } from 'react-i18next';

type LiveMatchTimedSetControlsProps = {
  canFreeze: boolean;
  canUnlock: boolean;
  onFreeze: () => void;
  onUnlock: () => void;
};

export function LiveMatchTimedSetControls({
  canFreeze,
  canUnlock,
  onFreeze,
  onUnlock,
}: LiveMatchTimedSetControlsProps) {
  const { t } = useTranslation();
  if (!canFreeze && !canUnlock) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {canFreeze ? (
        <button
          type="button"
          className="rounded-lg border border-amber-600/40 bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-950 dark:text-amber-100"
          onClick={onFreeze}
        >
          {t('gameDetails.liveScoring.timedLockCta')}
        </button>
      ) : null}
      {canUnlock ? (
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium dark:border-gray-600 dark:bg-gray-900"
          onClick={onUnlock}
        >
          {t('gameDetails.liveScoring.timedUnlockCta')}
        </button>
      ) : null}
    </div>
  );
}
