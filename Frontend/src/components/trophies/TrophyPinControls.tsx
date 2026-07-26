import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getTrophyPinErrorCode,
  useTrophyPinActions,
} from '@/hooks/useTrophyPinActions';

type TrophyPinControlsProps = {
  achievementId: string;
  isPinned: boolean;
  ownerUserId: string;
  compact?: boolean;
  showHint?: boolean;
  className?: string;
};

export function TrophyPinControls({
  achievementId,
  isPinned,
  ownerUserId,
  compact = false,
  showHint = true,
  className = '',
}: TrophyPinControlsProps) {
  const { t } = useTranslation();
  const { pin, unpin, busyId } = useTrophyPinActions(ownerUserId);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = busyId === achievementId;

  const handleClick = async () => {
    setErrorKey(null);
    try {
      if (isPinned) {
        await unpin(achievementId);
      } else {
        await pin(achievementId);
      }
    } catch (err) {
      const code = getTrophyPinErrorCode(err);
      if (code === 'pinsFull') setErrorKey('trophies.detail.pinsFull');
      else setErrorKey('trophies.detail.pinError');
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        className={
          compact
            ? `inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-70 ${
                isPinned
                  ? 'bg-white/80 text-gray-800 ring-1 ring-gray-200 hover:bg-white dark:bg-white/10 dark:text-white dark:ring-white/15'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500'
              }`
            : `w-full rounded-2xl px-4 py-3.5 text-sm font-bold tracking-tight transition active:scale-[0.99] disabled:opacity-70 ${
                isPinned
                  ? 'bg-gray-100 text-gray-900 ring-1 ring-gray-200/80 hover:bg-gray-200/80 dark:bg-white/10 dark:text-white dark:ring-white/10 dark:hover:bg-white/15'
                  : 'bg-gradient-to-r from-primary-600 to-primary-500 text-white shadow-md shadow-primary-600/25 hover:from-primary-700 hover:to-primary-600 dark:from-primary-500 dark:to-primary-400 dark:shadow-primary-500/20'
              }`
        }
      >
        <span aria-hidden className="text-[0.85em]">
          {isPinned ? '✦' : '☆'}
        </span>
        {busy
          ? isPinned
            ? t('trophies.detail.unpinning')
            : t('trophies.detail.pinning')
          : isPinned
            ? t('trophies.detail.unpin')
            : t('trophies.detail.pin')}
      </button>
      {errorKey && (
        <p className="text-center text-xs text-rose-600 dark:text-rose-300">{t(errorKey)}</p>
      )}
      {showHint && !isPinned && !errorKey && !compact && (
        <p className="text-center text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {t('trophies.detail.pinHint')}
        </p>
      )}
    </div>
  );
}
