import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import { findSportProfile } from '@/utils/profileSports';
import {
  formatLevelBandHint,
  formatLevelBandLabel,
  formatLevelSourceLabel,
  formatRatingHint,
  resolveProfileLevelSource,
} from '@/utils/sportRating';

type SportProfileLevelMetaProps = {
  user: User;
  sport: Sport;
  level: number;
  className?: string;
};

export function SportProfileLevelMeta({ user, sport, level, className = '' }: SportProfileLevelMetaProps) {
  const { t } = useTranslation();
  const profile = findSportProfile(user, sport);
  const bandLabel = formatLevelBandLabel(sport, level, t);
  const bandHint = formatLevelBandHint(sport, level, t);
  const ratingHint = formatRatingHint(sport, level, t, profile?.externalRatingHint);
  const levelSource = resolveProfileLevelSource(profile);
  const sourceLabel = formatLevelSourceLabel(levelSource, t);

  if (!bandLabel && !bandHint && !ratingHint && !sourceLabel) {
    return null;
  }

  return (
    <div className={`flex w-full flex-col items-center gap-1 text-center ${className}`}>
      {bandLabel ? (
        <span className="inline-flex max-w-full items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          {bandLabel}
        </span>
      ) : null}
      {bandHint ? (
        <span className="text-[9px] leading-tight text-gray-500 dark:text-gray-400">{bandHint}</span>
      ) : null}
      {ratingHint ? (
        <span className="rounded-md bg-gray-100/90 px-1.5 py-0.5 text-[9px] text-gray-600 dark:bg-gray-800/80 dark:text-gray-300">
          {ratingHint}
        </span>
      ) : null}
      {sourceLabel ? (
        <span className="text-[9px] text-gray-400 dark:text-gray-500">{sourceLabel}</span>
      ) : null}
    </div>
  );
}
