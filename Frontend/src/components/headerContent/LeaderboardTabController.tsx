import { Award, Beer, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHeaderStore } from '@/store/headerStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const LeaderboardTabController = () => {
  const { t } = useTranslation();
  const { leaderboardType, setLeaderboardType } = useHeaderStore();

  const tabs: SegmentedSwitchTab[] = [
    { id: 'level', label: t('profile.level', { defaultValue: 'Level' }), icon: Award },
    { id: 'games', label: t('profile.games', { defaultValue: 'Games' }), icon: Trophy },
    { id: 'social', label: t('profile.social', { defaultValue: 'Social' }), icon: Beer },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={leaderboardType}
      onChange={(id) => setLeaderboardType(id as 'level' | 'social' | 'games')}
      titleInActiveOnly
      layoutId="leaderboardSubtab"
    />
  );
};
