import { Bug, Package, Hash, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { usePlayersStore } from '@/store/playersStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const ChatsTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { chatsFilter, setChatsFilter } = useNavigationStore();
  const { counts } = useChatUnreadCounts();
  const unreadCounts = usePlayersStore((state) => state.unreadCounts);
  const userChatsCount = Object.values(unreadCounts).reduce((sum: number, count: number) => sum + count, 0);

  const handleFilter = (filter: 'users' | 'bugs' | 'channels' | 'market') => {
    setChatsFilter(filter);
    const base = filter === 'bugs' ? '/bugs' : filter === 'market' ? '/chats/marketplace' : '/chats';
    const q = searchParams.get('q');
    const path = q ? `${base}?q=${encodeURIComponent(q)}` : base;
    navigate(path, { replace: true });
  };

  const tabs: SegmentedSwitchTab[] = [
    { id: 'users', label: t('chats.chats', { defaultValue: 'Chats' }), icon: Users, badge: userChatsCount },
    { id: 'market', label: t('bottomTab.marketplace', { defaultValue: 'Market' }), icon: Package, badge: counts.marketplace },
    { id: 'channels', label: t('chats.channels', { defaultValue: 'Channels' }), icon: Hash, badge: counts.channels },
    { id: 'bugs', label: t('chats.bugs', { defaultValue: 'Bugs' }), icon: Bug, badge: counts.bugs },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={chatsFilter}
      onChange={(id) => handleFilter(id as 'users' | 'bugs' | 'channels' | 'market')}
      titleInActiveOnly
      layoutId="chatsSubtab"
    />
  );
};
