import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from './PlayerAvatar';
import { formatSmartRelativeTime } from '@/utils/dateFormat';
import type { User } from '@/types';

export interface ConfirmedLevelSectionProps {
  user: User;
}

export const ConfirmedLevelSection = ({ user }: ConfirmedLevelSectionProps) => {
  const { t } = useTranslation();
  const confirmed = Boolean(user.approvedLevel && user.approvedBy);

  return (
    <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/50">
      <div className="px-3 py-2.5">
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
        ) : (
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
            <span>{t('playerCard.levelNotConfirmed')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
