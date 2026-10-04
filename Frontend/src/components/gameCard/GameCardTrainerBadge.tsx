import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';
import type { GameParticipant } from '@/types';

interface GameCardTrainerBadgeProps {
  trainer: GameParticipant;
  className?: string;
}

/** One quiet line on the ticket: coach avatar, name and rating. */
export const GameCardTrainerBadge = ({ trainer, className = '' }: GameCardTrainerBadgeProps) => {
  const { t } = useTranslation();
  const trainerUser = trainer.user;
  const trainerName = [trainerUser?.firstName, trainerUser?.lastName].filter(Boolean).join(' ');
  const rating = trainerUser?.trainerRating;
  const reviewCount = trainerUser?.trainerReviewCount ?? 0;
  const showRating = trainerUser?.isTrainer && rating != null && reviewCount > 0;
  const initials = `${trainerUser?.firstName?.[0] ?? ''}${trainerUser?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <div className={`flex min-w-0 items-center gap-2 text-[12px] ${className}`}>
      <span className="relative h-5 w-5 shrink-0 rounded-full ring-1 ring-emerald-500/40">
        <PlayerAvatarFace
          avatar={trainerUser?.avatar}
          tinyUrl={userAvatarTinyUrlFromStandard(trainerUser?.avatar)}
          initials={initials}
          alt=""
          textClassName="text-[8px]"
          resetKey={trainer.userId}
        />
      </span>
      <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">
        {t('playerCard:isTrainer')}{' '}
        <span className="font-medium text-gray-800 dark:text-gray-200">{trainerName}</span>
      </span>
      {showRating ? (
        <span
          className="flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400"
          title={t('training.reviewCount', { count: reviewCount, defaultValue: '{{count}} reviews' })}
        >
          <Star size={11} className="shrink-0 fill-current" aria-hidden />
          <span className="font-semibold tabular-nums">{rating.toFixed(1)}</span>
        </span>
      ) : null}
    </div>
  );
};
