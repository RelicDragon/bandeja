import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BUG_STAR_VALUES, type BugStars } from '@/components/bugs/reviewStars';

interface BugStarRatingProps {
  value: number | null;
  onChange?: (stars: BugStars) => void;
  disabled?: boolean;
  readonly?: boolean;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function BugStarRating({
  value,
  onChange,
  disabled = false,
  readonly = false,
  size = 'md',
  showLabel = true,
}: BugStarRatingProps) {
  const { t } = useTranslation();
  const starSize = size === 'sm' ? 14 : 22;
  const current = value != null && value >= 1 && value <= 5 ? value : 0;
  const label = t('bug.stars', { defaultValue: 'Stars' });

  const stars = (
    <div
      className="flex items-center gap-0.5"
      role={readonly ? 'img' : 'radiogroup'}
      aria-label={label}
    >
      {BUG_STAR_VALUES.map((star) => {
        const filled = current >= star;
        const className = filled ? 'fill-amber-500 text-amber-500' : 'text-gray-300 dark:text-gray-600';
        if (readonly) {
          return <Star key={star} size={starSize} className={className} aria-hidden />;
        }
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(star)}
            aria-label={t(`bug.starLabels.${star}`, { defaultValue: String(star) })}
            aria-pressed={current === star}
            className={`p-0.5 rounded transition-transform ${
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'
            }`}
          >
            <Star size={starSize} className={className} />
          </button>
        );
      })}
    </div>
  );

  if (readonly) {
    if (!showLabel) return stars;
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-500 dark:text-gray-400">{label}:</span>
        {stars}
      </div>
    );
  }

  return (
    <div>
      {showLabel && (
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      {stars}
    </div>
  );
}
