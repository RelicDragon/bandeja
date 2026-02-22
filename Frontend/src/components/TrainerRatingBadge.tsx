import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';

interface TrainerRatingBadgeProps {
  trainer: BasicUser;
  size?: 'sm' | 'md';
  showReviewCount?: boolean;
}

export const TrainerRatingBadge = ({
  trainer,
  size = 'sm',
  showReviewCount = true,
}: TrainerRatingBadgeProps) => {
  const { t } = useTranslation();
  const count = trainer.trainerReviewCount ?? 0;
  const rating = trainer.trainerRating;

  if (!trainer.isTrainer || count === 0 || rating == null) return null;

  const isSm = size === 'sm';
  const starSize = isSm ? 12 : 14;

  return (
    <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
      <Star size={starSize} className="fill-current flex-shrink-0" />
      <span className={`font-semibold ${isSm ? 'text-xs' : 'text-sm'}`}>
        {rating.toFixed(1)}
      </span>
      {showReviewCount && (
        <span className={`text-gray-500 dark:text-gray-400 ${isSm ? 'text-[10px]' : 'text-xs'}`}>
          ({t('training.reviewCount', { count, defaultValue: '{{count}} reviews' })})
        </span>
      )}
    </div>
  );
};
