import { useEffect } from 'react';
import { Calendar, List, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useHeaderStore } from '@/store/headerStore';
import { useHomeFromUrl } from '@/hooks/useHomeFromUrl';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tab } = useHomeFromUrl();
  const { myGamesUnreadCount, pastGamesUnreadCount, hasUpcomingGames } = useHeaderStore();

  useEffect(() => {
    if (!hasUpcomingGames && tab === 'calendar') {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('tab', 'list');
      const qs = newParams.toString();
      navigate(qs ? `/?${qs}` : '/', { replace: true });
    }
  }, [hasUpcomingGames, tab, searchParams, navigate]);

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

  const allTabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar'), icon: Calendar, badge: myGamesUnreadCount },
    { id: 'list', label: t('games.list'), icon: List, badge: myGamesUnreadCount },
    { id: 'past-games', label: t('home.past'), icon: History, badge: pastGamesUnreadCount },
  ];
  const tabs = hasUpcomingGames ? allTabs : allTabs.filter((tabDef) => tabDef.id !== 'calendar');

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={tab}
      onChange={handleTabChange}
      titleInActiveOnly={true}
      layoutId="myGamesSubtab"
    />
  );
};
