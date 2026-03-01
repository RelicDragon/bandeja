import { Check, Beer } from 'lucide-react';
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
        <div className="flex justify-center mb-2">
          <span className="bg-yellow-500 dark:bg-yellow-600 text-white px-3 py-1.5 rounded-full font-bold text-sm shadow-md flex items-center gap-1 inline-flex">
            {user.approvedLevel && <Check size={14} className="text-white" strokeWidth={3} />}
            <span>{user.level.toFixed(2)}</span>
            <span className="text-[10px] font-normal opacity-90">{(user.reliability ?? 0).toFixed(0)}%</span>
            <span>•</span>
            <div className="relative flex items-center">
              <Beer size={14} className="text-amber-600 dark:text-amber-500 absolute" fill="currentColor" />
              <Beer size={14} className="text-white dark:text-gray-900 relative z-10" strokeWidth={1.5} />
            </div>
            <span>{user.socialLevel.toFixed(2)}</span>
          </span>
        </div>
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
