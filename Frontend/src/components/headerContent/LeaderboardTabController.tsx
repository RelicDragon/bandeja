import { Award, Beer, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useHeaderStore } from '@/store/headerStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const LeaderboardTabController = () => {
  const { t } = useTranslation();
  const { leaderboardType, setLeaderboardType } = useHeaderStore();

  const tabs: SegmentedSwitchTab[] = [
    {
      id: 'achievements',
      label: t('trophies.cabinet.title', { defaultValue: 'Achievements' }),
      icon: Trophy,
    },
    { id: 'level', label: t('profile.level', { defaultValue: 'Level' }), icon: Award },
    { id: 'social', label: t('profile.social', { defaultValue: 'Social' }), icon: Beer },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={leaderboardType}
      onChange={(id) => setLeaderboardType(id as 'level' | 'social' | 'achievements')}
      showOnlyActiveTabText
      activeLabelMaxWidth={120}
      className="[&_button]:px-2 [&_button]:text-xs"
      layoutId="leaderboardSubtab"
    />
  );
};
