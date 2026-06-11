import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TrainerRatingBadge } from '@/components/TrainerRatingBadge';
import type { GameParticipant } from '@/types';

interface GameCardTrainerBadgeProps {
  trainer: GameParticipant;
}

export const GameCardTrainerBadge = ({ trainer }: GameCardTrainerBadgeProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex-shrink-0 flex flex-col items-center gap-0.5 p-2 rounded-xl border border-green-300/80 dark:border-green-700/70 bg-gradient-to-b from-green-50/60 to-teal-50/30 dark:from-green-900/15 dark:to-teal-900/5 shadow-[0_2px_8px_rgba(34,197,94,0.12)] transition-shadow duration-300 group-hover:shadow-[0_4px_14px_rgba(34,197,94,0.22)]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
        {t('playerCard.isTrainer')}
      </span>
      <PlayerAvatar player={trainer.user} extrasmall={true} showName={true} />
      <TrainerRatingBadge trainer={trainer.user} size="sm" showReviewCount={false} />
    </div>
  );
};
