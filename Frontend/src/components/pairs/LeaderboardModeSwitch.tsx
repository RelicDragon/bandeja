import { useTranslation } from 'react-i18next';
import { User, Users } from 'lucide-react';
import { useHeaderStore } from '@/store/headerStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

/**
 * PRD 352 — Players · Pairs on the Top tab.
 *
 * Its own `layoutId`, so the sliding pill never fights the type switcher's
 * (`leaderboardSubtab`) in the header. The mode lives in `headerStore` next to
 * `leaderboardType`, so switching modes keeps every other filter untouched.
 */
export const LeaderboardModeSwitch = () => {
  const { t } = useTranslation();
  const leaderboardMode = useHeaderStore((state) => state.leaderboardMode);
  const setLeaderboardMode = useHeaderStore((state) => state.setLeaderboardMode);

  const tabs: SegmentedSwitchTab[] = [
    { id: 'players', label: t('pairs.mode.players'), icon: User },
    { id: 'pairs', label: t('pairs.mode.pairs'), icon: Users },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={leaderboardMode}
      onChange={(id) => setLeaderboardMode(id === 'pairs' ? 'pairs' : 'players')}
      showOnlyActiveTabText={false}
      ariaLabel={t('pairs.mode.label')}
      fullWidth
      size="sm"
      layoutId="leaderboardModeSwitch"
    />
  );
};
