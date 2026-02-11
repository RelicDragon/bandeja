import { Bug, Package, Hash, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useChatsFromUrl } from '@/hooks/useChatsFromUrl';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { usePlayersStore } from '@/store/playersStore';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const ChatsTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { filter } = useChatsFromUrl();
  const { counts } = useChatUnreadCounts();
  const unreadCounts = usePlayersStore((state) => state.unreadCounts);
  const userChatsCount = Object.values(unreadCounts).reduce((sum: number, count: number) => sum + count, 0);

  const handleFilter = (id: string) => {
    const f = id as 'users' | 'bugs' | 'channels' | 'market';
    let base: string;
    if (f === 'bugs') base = '/bugs';
    else if (f === 'market') base = '/chats/marketplace';
    else if (f === 'channels') base = '/chats?filter=channels';
    else base = '/chats';

    const q = searchParams.get('q');
    if (q) {
      const sep = base.includes('?') ? '&' : '?';
      base = `${base}${sep}q=${encodeURIComponent(q)}`;
    }
    navigate(base, { replace: true });
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
      activeId={filter}
      onChange={handleFilter}
      titleInActiveOnly
      layoutId="chatsSubtab"
    />
  );
};
