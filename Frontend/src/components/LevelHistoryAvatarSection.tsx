import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import {
  getDisplayLevelForSport,
  getReliabilityForSport,
  getUserPrimarySport,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';
import { ratingUncertaintyScale } from '@/utils/ratingUncertainty';
import { PlayStreakChip } from '@/components/playStreak/PlayStreakChip';
import { TrophyShowcase } from '@/components/trophies/TrophyShowcase';
import { useAuthStore } from '@/store/authStore';

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
  const authUserId = useAuthStore((s) => s.user?.id);
  const isOwn = authUserId === user.id;
  const levelSport = sport ?? getUserPrimarySport(user);
  const competitiveLevel = getDisplayLevelForSport(user, levelSport);
  const showCompetitive = shouldShowSportLevelBadge(user, levelSport);
  const reliability = getReliabilityForSport(user, levelSport);
  const uncertainty = user.ratingUncertainty;
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const playStreak = user.playStreak;
  const showStreak = Boolean(playStreak && (playStreak.current > 0 || playStreak.best > 0));

  return (
    <div
      className={
        embedded
          ? 'relative p-4 text-center'
          : 'relative rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-4 text-center dark:from-primary-600 dark:to-primary-800'
      }
    >
      <div className="flex items-center gap-2">
        {user.originalAvatar ? (
          <button type="button" className="cursor-pointer transition-opacity hover:opacity-90">
            {user.avatar ? (
              <img
                src={user.avatar || ''}
                alt={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User'}
                className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-xl dark:border-gray-800"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-4xl font-bold text-primary-600 shadow-xl dark:border-gray-800 dark:bg-gray-700 dark:text-primary-400">
                {initials}
              </div>
            )}
          </button>
        ) : user.avatar ? (
          <img
            src={user.avatar || ''}
            alt={`${user.firstName} ${user.lastName}`}
            className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-xl dark:border-gray-800"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-white text-4xl font-bold text-primary-600 shadow-xl dark:border-gray-800 dark:bg-gray-700 dark:text-primary-400">
            {initials}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col text-left">
          <div className="text-sm text-white">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="pb-6 text-6xl font-bold text-white">
            {showSocialLevel
              ? user.socialLevel.toFixed(2)
              : showCompetitive
                ? competitiveLevel.toFixed(2)
                : '—'}
          </div>
          {(showStreak || (isOwn && user.trophies) || (user.trophies?.unlockedCount ?? 0) > 0) && (
            <div className="relative z-10 -mt-3 mb-1 flex flex-col gap-2">
              {showStreak && playStreak && (
                <div>
                  <PlayStreakChip streak={playStreak} isOwn={isOwn} />
                </div>
              )}
              <TrophyShowcase
                trophies={user.trophies}
                isOwn={isOwn}
                ownerUserId={user.id}
                onLight
              />
            </div>
          )}
        </div>
      </div>
      {!showSocialLevel && showCompetitive && (
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5 text-right">
          <div className="text-xs text-white/80">
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
