import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';

interface TrainerRatingBadgeProps {
  trainer: BasicUser;
  size?: 'sm' | 'md';
  showReviewCount?: boolean;
  onClick?: () => void;
  /** Light text for rating on primary/colored hero backgrounds */
  variant?: 'default' | 'onPrimary';
}

export const TrainerRatingBadge = ({
  trainer,
  size = 'sm',
  showReviewCount = true,
  onClick,
  variant = 'default',
}: TrainerRatingBadgeProps) => {
  const { t } = useTranslation();
  const count = trainer.trainerReviewCount ?? 0;
  const rating = trainer.trainerRating;

  if (!trainer.isTrainer || count === 0 || rating == null) return null;

  const isSm = size === 'sm';
  const starSize = isSm ? 12 : 14;
  const onPrimary = variant === 'onPrimary';
  const toneClass = onPrimary
    ? 'text-amber-200'
    : 'text-amber-600 dark:text-amber-400';
  const reviewCountClass = onPrimary
    ? 'text-white/80'
    : 'text-gray-500 dark:text-gray-400';

  const content = (
    <>
      <Star size={starSize} className="fill-current flex-shrink-0" />
      <span className={`font-semibold ${isSm ? 'text-xs' : 'text-sm'}`}>
        {rating.toFixed(1)}
      </span>
      {showReviewCount && (
        <span className={`${reviewCountClass} ${isSm ? 'text-[10px]' : 'text-xs'}`}>
          ({t('training.reviewCount', { count, defaultValue: '{{count}} reviews' })})
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`flex items-center gap-1 ${toneClass} cursor-pointer hover:opacity-90 active:opacity-80 transition-opacity`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${toneClass}`}>
      {content}
    </div>
  );
};
