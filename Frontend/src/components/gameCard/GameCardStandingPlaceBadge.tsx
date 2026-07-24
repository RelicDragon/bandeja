import { Medal, Trophy } from 'lucide-react';
import {
  resolveStandingPlaceVisual,
  type StandingMedalMode,
} from '@/utils/gameCardStandingPlace';

interface GameCardStandingPlaceBadgeProps {
  place: number;
  medalMode: StandingMedalMode;
}

const MEDAL_CLASS: Record<'gold' | 'silver' | 'bronze', string> = {
  gold: 'text-yellow-500 dark:text-yellow-400',
  silver: 'text-gray-400 dark:text-gray-300',
  bronze: 'text-amber-600 dark:text-amber-500',
};

export function GameCardStandingPlaceBadge({ place, medalMode }: GameCardStandingPlaceBadgeProps) {
  const visual = resolveStandingPlaceVisual(place, medalMode);

  if (visual === 'gold') {
    return (
      <div
        className={`mb-0.5 flex h-4 items-center justify-center ${MEDAL_CLASS.gold}`}
        aria-label={`Place ${place}`}
      >
        <Trophy size={14} strokeWidth={2.25} aria-hidden />
      </div>
    );
  }

  if (visual === 'silver' || visual === 'bronze') {
    return (
      <div
        className={`mb-0.5 flex h-4 items-center justify-center ${MEDAL_CLASS[visual]}`}
        aria-label={`Place ${place}`}
      >
        <Medal size={14} strokeWidth={2.25} aria-hidden />
      </div>
    );
  }

  return (
    <div
      className="mb-0.5 flex h-4 items-center justify-center text-[11px] font-bold tabular-nums leading-none text-gray-500 dark:text-gray-400"
      aria-label={`Place ${place}`}
    >
      {place}
    </div>
  );
}
