import type { Sport, User } from '@/types';
import { gamesPlayedForSport, getUserPrimarySport } from '@/utils/profileSports';
import { LevelHistoryLevelSelector, type LevelHistorySelection } from './LevelHistoryLevelSelector';
import { LevelHistoryAvatarSection } from './LevelHistoryAvatarSection';
import { ConfirmedLevelSection } from './ConfirmedLevelSection';
import { SocialLevelRating } from '@/components/profile/SocialLevelRating';
import { PlayerActivityCounts } from '@/components/player/PlayerActivityCounts';

export type { LevelHistorySelection };

export type LevelHistoryLevelPanelVariant = 'compact' | 'hero';

type LevelHistoryLevelPanelProps = {
  user: User;
  sports: Sport[];
  selection: LevelHistorySelection;
  onChange: (value: LevelHistorySelection) => void;
  variant?: LevelHistoryLevelPanelVariant;
  includeSportsInSelector?: boolean;
  includeSocialInSelector?: boolean;
  competitiveSport?: Sport;
  trainingAttendanceCount?: number;
};

export function LevelHistoryLevelPanel({
  user,
  sports,
  selection,
  onChange,
  variant = 'compact',
  includeSportsInSelector = true,
  includeSocialInSelector = true,
  competitiveSport,
  trainingAttendanceCount = 0,
}: LevelHistoryLevelPanelProps) {
  const showSocialLevel = selection.kind === 'social';
  const historySport =
    selection.kind === 'competitive' ? selection.sport : getUserPrimarySport(user);
  const gamesPlayed = gamesPlayedForSport(user, historySport);
  const showSelector =
    (includeSportsInSelector && sports.length > 0) || includeSocialInSelector;
  const selectorTone = variant === 'hero' ? 'onGradient' : 'neutral';
  const selectorCompetitiveSport =
    competitiveSport
    ?? (selection.kind === 'competitive' ? selection.sport : undefined)
    ?? sports[0];

  if (variant === 'hero') {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200/60 dark:border-gray-600/50">
        <div className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-600 dark:to-primary-800">
          {showSelector && (
            <LevelHistoryLevelSelector
              sports={sports}
              value={selection}
              onChange={onChange}
              embedded
              tone={selectorTone}
              includeSports={includeSportsInSelector}
              includeSocial={includeSocialInSelector}
              competitiveSport={selectorCompetitiveSport}
            />
          )}
          <LevelHistoryAvatarSection
            user={user}
            sport={historySport}
            showSocialLevel={showSocialLevel}
            embedded
            gamesPlayed={gamesPlayed}
            trainingAttendanceCount={trainingAttendanceCount}
          />
        </div>
        {!showSocialLevel && (
          <ConfirmedLevelSection
            user={user}
            sport={historySport}
            embedded
            showBadge={false}
            gamesPlayed={gamesPlayed}
            trainingAttendanceCount={trainingAttendanceCount}
            showActivityCounts={false}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/50">
      {showSelector && (
        <LevelHistoryLevelSelector
          sports={sports}
          value={selection}
          onChange={onChange}
          embedded
          tone={selectorTone}
          includeSports={includeSportsInSelector}
          includeSocial={includeSocialInSelector}
          competitiveSport={selectorCompetitiveSport}
        />
      )}
      {showSocialLevel ? (
        <div className="px-3 py-2.5">
          <SocialLevelRating user={user} />
          <PlayerActivityCounts
            gamesPlayed={gamesPlayed}
            trainingAttendanceCount={trainingAttendanceCount}
            className="mt-1.5 text-center text-gray-500 dark:text-gray-400"
          />
        </div>
      ) : (
        <ConfirmedLevelSection
          user={user}
          sport={historySport}
          embedded
          gamesPlayed={gamesPlayed}
          trainingAttendanceCount={trainingAttendanceCount}
        />
      )}
    </div>
  );
}
