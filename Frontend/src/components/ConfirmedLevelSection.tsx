import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from './PlayerAvatar';
import { CompetitiveSocialLevelBadge } from '@/components/profile/CompetitiveSocialLevelBadge';
import { formatSmartRelativeTime } from '@/utils/dateFormat';
import { getUserPrimarySport } from '@/utils/profileSports';
import type { Sport, User } from '@/types';

export interface ConfirmedLevelSectionProps {
  user: User;
  sport?: Sport;
  embedded?: boolean;
  showBadge?: boolean;
}

export const ConfirmedLevelSection = ({
  user,
  sport,
  embedded = false,
  showBadge = true,
}: ConfirmedLevelSectionProps) => {
  const { t } = useTranslation();
  const levelSport = sport ?? getUserPrimarySport(user);
  const confirmed = Boolean(user.approvedLevel && user.approvedBy);

  const content = (
    <>
      {showBadge && (
        <div className={`flex justify-center ${confirmed || !embedded ? 'mb-2' : ''}`}>
          <CompetitiveSocialLevelBadge
            user={user}
            sport={levelSport}
            showSportLabel
            showApprovedCheck={confirmed}
            showReliability
            levelDecimals={2}
            className="bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-md flex items-center gap-1 inline-flex"
          />
        </div>
      )}
      {confirmed ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <Check size={16} strokeWidth={3} />
              <span className="text-sm font-medium">{t('playerCard.confirmedBy')}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-gray-700 dark:text-gray-300 text-sm">
              <PlayerAvatar player={user.approvedBy!} showName={false} fullHideName={true} extrasmall={true} />
              <span className="font-medium">{user.approvedBy!.firstName} {user.approvedBy!.lastName}</span>
              {user.approvedWhen && (
                <>
                  <span className="text-gray-500 dark:text-gray-500">•</span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {formatSmartRelativeTime(user.approvedWhen, t)}
                  </span>
                </>
              )}
            </div>
          </div>
        ) : showBadge ? (
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <span>{t('playerCard.levelNotConfirmed')}</span>
          </div>
        ) : null}
    </>
  );

  if (embedded) {
    return <div className="px-3 py-2.5">{content}</div>;
  }

  return (
    <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/50">
      <div className="px-3 py-2.5">{content}</div>
    </div>
  );
};
