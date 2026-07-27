import { useState } from 'react';
import { Star } from 'lucide-react';
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

  const label = busy
    ? isPinned
      ? t('trophies.detail.unpinning')
      : t('trophies.detail.pinning')
    : isPinned
      ? t('trophies.detail.unpin')
      : t('trophies.detail.pin');

  return (
    <div className={`space-y-1.5 ${className}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        aria-pressed={isPinned}
        className={
          compact
            ? `inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-70 ${
                isPinned
                  ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80 hover:bg-amber-100/80 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/25 dark:hover:bg-amber-400/15'
                  : 'bg-primary-600 text-white hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-400'
              }`
            : `inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-semibold tracking-tight transition active:scale-[0.99] disabled:opacity-70 ${
                isPinned
                  ? 'bg-amber-50 text-amber-950 ring-1 ring-amber-200/90 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-50 dark:ring-amber-400/30 dark:hover:bg-amber-400/15'
                  : 'bg-primary-600 text-white shadow-sm shadow-primary-600/20 hover:bg-primary-700 dark:bg-primary-500 dark:shadow-primary-500/20 dark:hover:bg-primary-400'
              }`
        }
      >
        <Star
          aria-hidden
          className={compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'}
          strokeWidth={2.25}
          fill={isPinned ? 'currentColor' : 'none'}
        />
        <span>{label}</span>
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
