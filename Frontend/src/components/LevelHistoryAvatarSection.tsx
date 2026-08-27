import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import {
  gamesPlayedForSport,
  getDisplayLevelForSport,
  getReliabilityForSport,
  getUserPrimarySport,
  shouldShowSportLevelBadge,
} from '@/utils/profileSports';
import { PlayStreakChip } from '@/components/playStreak/PlayStreakChip';
import { TrophyShowcase } from '@/components/trophies/TrophyShowcase';
import { useAuthStore } from '@/store/authStore';
import { PlayerActivityCounts } from '@/components/player/PlayerActivityCounts';

export interface LevelHistoryAvatarSectionProps {
  user: User;
  sport?: Sport;
  showSocialLevel: boolean;
  embedded?: boolean;
  gamesPlayed?: number;
  trainingAttendanceCount?: number;
}

export const LevelHistoryAvatarSection = ({
  user,
  sport,
  showSocialLevel,
  embedded = false,
  gamesPlayed,
  trainingAttendanceCount = 0,
}: LevelHistoryAvatarSectionProps) => {
  const { t } = useTranslation();
  const authUserId = useAuthStore((s) => s.user?.id);
  const isOwn = authUserId === user.id;
  const levelSport = sport ?? getUserPrimarySport(user);
  const competitiveLevel = getDisplayLevelForSport(user, levelSport);
  const showCompetitive = shouldShowSportLevelBadge(user, levelSport);
  const reliability = getReliabilityForSport(user, levelSport);
  const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  const playStreak = user.playStreak;
  const showStreak = Boolean(playStreak && playStreak.current > 0);
  const showShowcase =
    showStreak || (isOwn && user.trophies) || (user.trophies?.unlockedCount ?? 0) > 0;
  const showReliability = !showSocialLevel && showCompetitive;

  return (
    <div
      className={
        embedded
          ? 'relative p-4 text-center'
          : 'relative rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 p-4 text-center dark:from-primary-600 dark:to-primary-800'
      }
    >
      <div className="flex items-start gap-2">
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

        <div className="flex min-h-24 min-w-0 flex-1 flex-col text-start">
          <div className="text-sm text-white">
            {showSocialLevel ? t('rating.socialLevel') : t('playerCard.currentLevel')}
          </div>
          <div className="text-6xl font-bold leading-none text-white">
            {showSocialLevel
              ? user.socialLevel.toFixed(2)
              : showCompetitive
                ? competitiveLevel.toFixed(2)
                : '—'}
          </div>
          <PlayerActivityCounts
            gamesPlayed={gamesPlayed ?? gamesPlayedForSport(user, levelSport)}
            trainingAttendanceCount={trainingAttendanceCount}
            className="mt-1.5 text-start text-white/80"
          />
          {showShowcase && (
            <div className="relative z-10 mt-2 flex flex-col gap-2">
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
          {showReliability && (
            <div className="mt-auto pt-2 text-end text-xs text-white/80">
              {t('rating.reliability')}: {reliability.toFixed(0)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
