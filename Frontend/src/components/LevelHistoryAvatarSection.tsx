import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import {
  findSportProfile,
  getDisplayLevelForSport,
  getUserPrimarySport,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';

export interface LevelHistoryAvatarSectionProps {
  user: User;
  sport?: Sport;
  showSocialLevel: boolean;
  embedded?: boolean;
}

export const LevelHistoryAvatarSection = ({
  user,
  sport,
  showSocialLevel,
  embedded = false,
}: LevelHistoryAvatarSectionProps) => {
  const { t } = useTranslation();
  const levelSport = sport ?? getUserPrimarySport(user);
  const competitiveLevel = getDisplayLevelForSport(user, levelSport);
  const showCompetitive = shouldShowSportLevelBadge(user, levelSport);
  const sportProfile = findSportProfile(user, levelSport);
  const reliability = sportProfile?.reliability ?? 0;
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
        <div className="absolute bottom-3 right-3 text-white/80 text-xs">
          {t('rating.reliability')}: {reliability.toFixed(0)}%
        </div>
      )}
    </div>
  );
};
