import { Calendar, List, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMyGamesSubtabUnreadBadges } from '@/hooks/useUnreadBridge';
import { useHomeFromUrl } from '@/hooks/useHomeFromUrl';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tab } = useHomeFromUrl();
  const { myGames: myGamesUnreadCount, pastGames: pastGamesUnreadCount } = useMyGamesSubtabUnreadBadges();

  const handleTabChange = (id: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (id === 'calendar') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', id);
    }
    const qs = newParams.toString();
    navigate(qs ? `/?${qs}` : '/', { replace: true });
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar'), icon: Calendar, badge: myGamesUnreadCount },
    { id: 'list', label: t('games.list'), icon: List, badge: myGamesUnreadCount },
    { id: 'past-games', label: t('home.past'), icon: History, badge: pastGamesUnreadCount },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={tab}
      onChange={handleTabChange}
      showOnlyActiveTabText={true}
      layoutId="myGamesSubtab"
    />
  );
};
