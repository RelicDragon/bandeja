import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from './PlayerAvatar';
import { CompetitiveSocialLevelBadge } from '@/components/profile/CompetitiveSocialLevelBadge';
import { formatSmartRelativeTime } from '@/utils/dateFormat';
import {
  findSportProfile,
  gamesPlayedForSport,
  getDisplayLevelForSport,
  getSportLevelApprovedWhen,
  getUserPrimarySport,
  isLevelConfirmedForSport,
} from '@/utils/profileSports';
import { formatRatingHint } from '@/utils/sportRating';
import type { Sport, User } from '@/types';
import { PlayerActivityCounts } from '@/components/player/PlayerActivityCounts';

export interface ConfirmedLevelSectionProps {
  user: User;
  sport?: Sport;
  embedded?: boolean;
  showBadge?: boolean;
  gamesPlayed?: number;
  trainingAttendanceCount?: number;
  showActivityCounts?: boolean;
}

export const ConfirmedLevelSection = ({
  user,
  sport,
  embedded = false,
  showBadge = true,
  gamesPlayed,
  trainingAttendanceCount = 0,
  showActivityCounts = true,
}: ConfirmedLevelSectionProps) => {
  const { t } = useTranslation();
  const levelSport = sport ?? getUserPrimarySport(user);
  const confirmed = isLevelConfirmedForSport(user, levelSport);
  const approvedWhen = getSportLevelApprovedWhen(user, levelSport);
  const profile = findSportProfile(user, levelSport);
  const approvedByMatches =
    !profile?.approvedById ||
    user.approvedBy?.id === profile.approvedById ||
    user.approvedById === profile.approvedById;
  const approvedBy = confirmed && approvedByMatches ? user.approvedBy : null;
  const ratingHint = formatRatingHint(
    levelSport,
    getDisplayLevelForSport(user, levelSport),
    t,
    profile?.externalRatingHint,
  );
  const ratedGamesPlayed = gamesPlayed ?? gamesPlayedForSport(user, levelSport);

  const confirmation =
    confirmed && approvedBy ? (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
          <Check size={16} strokeWidth={3} />
          <span className="text-sm font-medium">{t('playerCard.confirmedBy')}</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
          <PlayerAvatar player={approvedBy} showName={false} fullHideName={true} extrasmall={true} />
          <span className="font-medium">
            {approvedBy.firstName} {approvedBy.lastName}
          </span>
          {approvedWhen && (
            <>
              <span className="text-gray-500 dark:text-gray-500">•</span>
              <span className="text-gray-600 dark:text-gray-400">
                {formatSmartRelativeTime(approvedWhen, t)}
              </span>
            </>
          )}
        </div>
      </div>
    ) : confirmed && !approvedBy ? (
      <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400 text-sm">
        <Check size={16} strokeWidth={3} />
        <span className="font-medium">{t('playerCard.confirmedBy')}</span>
        {approvedWhen && (
          <span className="text-gray-600 dark:text-gray-400">
            {formatSmartRelativeTime(approvedWhen, t)}
          </span>
        )}
      </div>
    ) : showBadge ? (
      <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
        <span>{t('playerCard.levelNotConfirmed')}</span>
      </div>
    ) : null;

  if (!ratingHint && !showBadge && !confirmation && !showActivityCounts) return null;

  const content = (
    <>
      {ratingHint && (
        <p className="mb-2 text-center text-xs text-gray-500 dark:text-gray-400">{ratingHint}</p>
      )}
      {showBadge && (
        <div className={`flex justify-center ${confirmed || !embedded ? 'mb-2' : ''}`}>
          <CompetitiveSocialLevelBadge
            user={user}
            sport={levelSport}
            showSportLabel
            showApprovedCheck={confirmed}
            showReliability
            levelDecimals={2}
            className="inline-flex items-center gap-1 rounded-full bg-yellow-500 px-3 py-1.5 text-sm font-bold text-white shadow-md dark:bg-yellow-600"
          />
        </div>
      )}
      {showActivityCounts && (
        <PlayerActivityCounts
          gamesPlayed={ratedGamesPlayed}
          trainingAttendanceCount={trainingAttendanceCount}
          className={`text-gray-500 dark:text-gray-400 ${showBadge ? 'mt-2' : ''}`}
        />
      )}
      {confirmation}
    </>
  );

  if (embedded) {
    return <div className="px-3 py-2.5">{content}</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200/60 bg-gray-100 dark:border-gray-600/50 dark:bg-gray-700/50">
      <div className="px-3 py-2.5">{content}</div>
    </div>
  );
};
