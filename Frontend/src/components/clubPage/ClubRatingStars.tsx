import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';

type ClubRatingStarsProps = {
  rating: number | null;
  reviewCount: number;
  /** Premium members get gold stars; everybody else gets amber. */
  premium?: boolean;
  onColor?: boolean;
  className?: string;
};

const STAR_COUNT = 5;

/**
 * PRD 354 — rating on the club hero.
 *
 * The stars are `aria-hidden`; the rating is always also exposed as text
 * ("4.6 · 38 reviews"), formatted per active locale, so a screen reader and a
 * colour-blind reader get the same information.
 */
export function ClubRatingStars({
  rating,
  reviewCount,
  premium = false,
  onColor = false,
  className = '',
}: ClubRatingStarsProps) {
  const { t, i18n } = useTranslation();

  const ratingText = useMemo(() => {
    if (rating == null) return null;
    return new Intl.NumberFormat(i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(rating);
  }, [i18n.language, rating]);

  const countText = useMemo(
    () => new Intl.NumberFormat(i18n.language).format(reviewCount),
    [i18n.language, reviewCount],
  );

  if (rating == null || reviewCount === 0) {
    return (
      <p className={`text-sm ${onColor ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'} ${className}`.trim()}>
        {t('clubPage.rating.none')}
      </p>
    );
  }

  const filled = Math.round(rating);
  const starTone = premium
    ? 'text-amber-300 fill-amber-300'
    : onColor
      ? 'text-white fill-white'
      : 'text-amber-500 fill-amber-500';
  const emptyTone = onColor ? 'text-white/40' : 'text-gray-300 dark:text-gray-600';

  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${onColor ? 'text-white' : 'text-gray-700 dark:text-gray-200'} ${className}`.trim()}
    >
      <span className="flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <Star key={i} size={14} className={i < filled ? starTone : emptyTone} strokeWidth={1.5} />
        ))}
      </span>
      <span>
        {t('clubPage.rating.summary', { rating: ratingText, count: reviewCount, countText })}
      </span>
    </p>
  );
}
