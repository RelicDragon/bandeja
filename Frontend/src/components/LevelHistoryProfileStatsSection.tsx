import { useTranslation } from 'react-i18next';
import type { User } from '@/types';

export interface LevelHistoryProfileStatsSectionProps {
  user: Pick<User, 'preferredHandLeft' | 'preferredHandRight' | 'preferredCourtSideLeft' | 'preferredCourtSideRight'>;
  followersCount: number;
  followingCount: number;
}

export const LevelHistoryProfileStatsSection = ({ user, followersCount, followingCount }: LevelHistoryProfileStatsSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/50">
      <div className="flex items-center gap-0 border-b border-gray-200/60 dark:border-gray-600/50">
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-gray-200/60 dark:border-gray-600/50">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.followers') || 'Followers'}</span>
          <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{followersCount}</span>
        </div>
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('playerCard.following') || 'Following'}</span>
          <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-white">{followingCount}</span>
        </div>
      </div>
      <div className="flex items-center gap-0">
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 border-r border-gray-200/60 dark:border-gray-600/50">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.preferredHand')}</span>
          <div className="flex gap-1">
            <div
              className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredHandLeft ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
              title={t('profile.left')}
            >
              <span className="text-[8px] font-semibold leading-none truncate">{t('profile.leftShort')}</span>
            </div>
            <div
              className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredHandRight ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
              title={t('profile.right')}
            >
              <span className="text-[8px] font-semibold leading-none truncate">{t('profile.rightShort')}</span>
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.preferredCourtSide')}</span>
          <div className="flex gap-1">
            <div
              className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredCourtSideLeft ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
              title={t('profile.left')}
            >
              <span className="text-[8px] font-semibold leading-none truncate">{t('profile.leftShort')}</span>
            </div>
            <div
              className={`w-5 min-h-[0.75rem] rounded-sm flex items-center justify-center min-w-0 px-0.5 py-1.5 ${user.preferredCourtSideRight ? 'bg-blue-500 dark:bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.6)]' : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'}`}
              title={t('profile.right')}
            >
              <span className="text-[8px] font-semibold leading-none truncate">{t('profile.rightShort')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
