import { Calendar, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHomeFromUrl } from '@/hooks/useHomeFromUrl';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import { AgentGlyph } from '@/components/agent/AgentGlyph';

export const MyGamesTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { tab } = useHomeFromUrl();
  // Desktop keeps the My header on an open AI chat (`/ai/:chatId`, split view).
  const isAgentChatPath = location.pathname.startsWith('/ai/');
  const activeId = isAgentChatPath ? 'ai' : tab;

  const handleTabChange = (id: string) => {
    const newParams = new URLSearchParams(isAgentChatPath ? '' : searchParams);
    // `focus=invites` is a one-shot bell intent; carrying it over would force the
    // calendar and re-scroll to invites on every sub-tab click.
    newParams.delete('focus');
    if (id === 'calendar') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', id);
    }
    const qs = newParams.toString();
    navigate(qs ? `/?${qs}` : '/', { replace: !isAgentChatPath });
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'calendar', label: t('games.calendar'), icon: Calendar },
    { id: 'past-games', label: t('home.past'), icon: History },
    { id: 'ai', label: t('agent.tab'), icon: AgentGlyph },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={activeId}
      onChange={handleTabChange}
      showOnlyActiveTabText={true}
      layoutId="myGamesSubtab"
    />
  );
};
