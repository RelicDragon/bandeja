import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import {
  getDisplayLevelForSport,
  getReliabilityForSport,
  getUserPrimarySport,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';
import { ratingUncertaintyScale } from '@/utils/ratingUncertainty';

export interface LevelHistoryAvatarSectionProps {
  user: User;
  sport?: Sport;
  showSocialLevel: boolean;
  embedded?: boolean;
  showRatingUncertainty?: boolean;
}

export const LevelHistoryAvatarSection = ({
  user,
  sport,
  showSocialLevel,
  embedded = false,
  showRatingUncertainty = false,
}: LevelHistoryAvatarSectionProps) => {
  const { t } = useTranslation();
  const levelSport = sport ?? getUserPrimarySport(user);
  const competitiveLevel = getDisplayLevelForSport(user, levelSport);
  const showCompetitive = shouldShowSportLevelBadge(user, levelSport);
  const reliability = getReliabilityForSport(user, levelSport);
  const uncertainty = user.ratingUncertainty;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();

  return (
    <div
      className={
        embedded
          ? 'p-4 text-center relative'
          : 'bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800 rounded-2xl p-4 text-center relative'
      }
    >
      <div className="flex gap-2 items-center">
        {user.originalAvatar ? (
          <button type="button" className="cursor-pointer hover:opacity-90 transition-opacity">
            {user.avatar ? (
              <img
                src={user.avatar || ''}
                alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
                className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
                {initials}
              </div>
            )}
          </button>
        ) : user.avatar ? (
          <img
            src={user.avatar || ''}
            alt={`${user.firstName} ${user.lastName}`}
            className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-xl"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-xl">
            {initials}
          </div>
        )}

        <div className="flex flex-col text-left">
          <div className="text-white text-sm">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="text-white text-6xl font-bold pb-6">
            {showSocialLevel
              ? user.socialLevel.toFixed(2)
              : showCompetitive
                ? competitiveLevel.toFixed(2)
                : '—'}
          </div>
        </div>
      </div>
      {!showSocialLevel && showCompetitive && (
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5 text-right">
          <div className="text-white/80 text-xs">
            {t('rating.reliability')}: {reliability.toFixed(0)}%
          </div>
          {user.ratingSettling && (
            <div className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/25">
              {t('rating.settling')}
            </div>
          )}
          {showRatingUncertainty && uncertainty != null && uncertainty > 0 && (
            <div className="inline-flex items-center rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white/95">
              {t('rating.uncertainty')} {uncertainty.toFixed(0)} ·{' '}
              {ratingUncertaintyScale(uncertainty).toFixed(2)}×
            </div>
          )}
        </div>
      )}
    </div>
  );
};
