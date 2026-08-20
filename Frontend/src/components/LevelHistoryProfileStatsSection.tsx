import { useTranslation } from 'react-i18next';
import { PreferenceLrChipPair } from '@/components/playerProfile/PreferenceLrChipPair';
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
          <PreferenceLrChipPair
            group="hand"
            groupLabel={t('profile.preferredHand')}
            left={user.preferredHandLeft}
            right={user.preferredHandRight}
            leftLabel={t('profile.leftShort')}
            rightLabel={t('profile.rightShort')}
            leftTitle={t('profile.left')}
            rightTitle={t('profile.right')}
          />
        </div>
        <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.preferredCourtSide')}</span>
          <PreferenceLrChipPair
            group="courtSide"
            groupLabel={t('profile.preferredCourtSide')}
            left={user.preferredCourtSideLeft}
            right={user.preferredCourtSideRight}
            leftLabel={t('profile.leftShort')}
            rightLabel={t('profile.rightShort')}
            leftTitle={t('profile.left')}
            rightTitle={t('profile.right')}
          />
        </div>
      </div>
    </div>
  );
};
