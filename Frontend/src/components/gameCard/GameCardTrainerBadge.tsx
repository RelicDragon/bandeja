import { Star, Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { GameParticipant } from '@/types';

interface GameCardTrainerBadgeProps {
  trainer: GameParticipant;
  className?: string;
}

export const GameCardTrainerBadge = ({ trainer, className = '' }: GameCardTrainerBadgeProps) => {
  const { t } = useTranslation();
  const trainerUser = trainer.user;
  const trainerName = [trainerUser?.firstName, trainerUser?.lastName].filter(Boolean).join(' ');
  const rating = trainerUser?.trainerRating;
  const reviewCount = trainerUser?.trainerReviewCount ?? 0;
  const showRating = trainerUser?.isTrainer && rating != null && reviewCount > 0;

  return (
    <div
      className={`flex w-full items-center gap-3 rounded-xl border border-green-200/90 bg-gradient-to-r from-green-50/80 to-emerald-50/40 p-2.5 shadow-sm dark:border-green-800/45 dark:from-green-950/30 dark:to-emerald-950/20 ${className}`}
    >
      <PlayerAvatar player={trainerUser} smallLayout showName={false} fullHideName asDiv />
      <div className="w-0 flex-1">
        <span className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-green-100/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:bg-green-900/50 dark:text-green-300">
          <Dumbbell size={10} className="shrink-0" aria-hidden />
          {t('playerCard.isTrainer')}
        </span>
        {trainerName ? (
          <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">
            {trainerName}
          </p>
        ) : null}
        {showRating ? (
          <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-amber-600 dark:text-amber-400">
            <Star size={12} className="shrink-0 fill-current" aria-hidden />
            <span className="text-xs font-semibold tabular-nums">{rating.toFixed(1)}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              ({t('training.reviewCount', { count: reviewCount, defaultValue: '{{count}} reviews' })})
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
