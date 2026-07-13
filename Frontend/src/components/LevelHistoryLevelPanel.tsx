import type { Sport, User } from '@/types';
import { getUserPrimarySport } from '@/utils/profileSports';
import { LevelHistoryLevelSelector, type LevelHistorySelection } from './LevelHistoryLevelSelector';
import { LevelHistoryAvatarSection } from './LevelHistoryAvatarSection';
import { ConfirmedLevelSection } from './ConfirmedLevelSection';
import { SocialLevelRating } from '@/components/profile/SocialLevelRating';
import { useAuthStore } from '@/store/authStore';

export type { LevelHistorySelection };

export type LevelHistoryLevelPanelVariant = 'compact' | 'hero';

type LevelHistoryLevelPanelProps = {
  user: User;
  sports: Sport[];
  selection: LevelHistorySelection;
  onChange: (value: LevelHistorySelection) => void;
  variant?: LevelHistoryLevelPanelVariant;
};

export function LevelHistoryLevelPanel({
  user,
  sports,
  selection,
  onChange,
  variant = 'compact',
}: LevelHistoryLevelPanelProps) {
  const isAdmin = Boolean(useAuthStore((s) => s.user)?.isAdmin);
  const showSocialLevel = selection.kind === 'social';
  const historySport =
    selection.kind === 'competitive' ? selection.sport : getUserPrimarySport(user);
  const showSelector = sports.length > 0;
  const selectorTone = variant === 'hero' ? 'onGradient' : 'neutral';

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
            />
          )}
          <LevelHistoryAvatarSection
            user={user}
            sport={historySport}
            showSocialLevel={showSocialLevel}
            embedded
            showRatingUncertainty={isAdmin}
          />
        </div>
        {!showSocialLevel && (
          <ConfirmedLevelSection user={user} sport={historySport} embedded showBadge={false} />
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
        />
      )}
      {showSocialLevel ? (
        <div className="px-3 py-2.5">
          <SocialLevelRating user={user} />
        </div>
      ) : (
        <ConfirmedLevelSection user={user} sport={historySport} embedded />
      )}
    </div>
  );
}
