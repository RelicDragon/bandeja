import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';
import { useHeaderStore } from '@/store/headerStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const { activeTab, setActiveTab } = useNavigationStore();
  const { myGamesUnreadCount, pastGamesUnreadCount } = useHeaderStore();

  const tabs: SegmentedSwitchTab[] = [
    { id: 'my-games', label: t('home.myGames'), badge: myGamesUnreadCount },
    { id: 'past-games', label: t('home.past'), badge: pastGamesUnreadCount },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={activeTab}
      onChange={(id) => setActiveTab(id as 'my-games' | 'past-games')}
      titleInActiveOnly={false}
      layoutId="myGamesSubtab"
    />
  );
};
