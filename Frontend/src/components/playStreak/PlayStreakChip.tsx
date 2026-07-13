import { useState } from 'react';
import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlayStreakView } from '@/types/playStreak';
import { PlayStreakSheet } from '@/components/playStreak/PlayStreakSheet';

type PlayStreakChipProps = {
  streak: PlayStreakView;
  isOwn?: boolean;
  /** When true, hide broken/empty chip (current must be > 0). */
  aliveOnly?: boolean;
  className?: string;
};

export function PlayStreakChip({
  streak,
  isOwn = false,
  aliveOnly = false,
  className = '',
}: PlayStreakChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (aliveOnly ? streak.current <= 0 : streak.current <= 0 && streak.best <= 0) return null;

  const atRisk = isOwn && streak.atRisk && streak.current > 0;
  const label =
    streak.current > 0
      ? t('playStreak.chipWeeks', { count: streak.current })
      : t('playStreak.chipBroken', { best: streak.best });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-transform active:scale-95 ${
          atRisk
            ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400/70 animate-pulse dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-500/50'
            : streak.current > 0
              ? 'bg-orange-100 text-orange-900 dark:bg-orange-950/50 dark:text-orange-100'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
        } ${className}`}
        aria-label={label}
      >
        <Flame
          size={14}
          className={streak.current > 0 ? 'fill-orange-500 text-orange-500' : 'text-gray-400'}
          aria-hidden
        />
        <span>{label}</span>
      </button>
      <PlayStreakSheet streak={streak} open={open} onOpenChange={setOpen} isOwn={isOwn} />
    </>
  );
}
