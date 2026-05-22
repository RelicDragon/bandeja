import { Bug, Package, Hash, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useChatsFromUrl } from '@/hooks/useChatsFromUrl';
import { useChatsSubtabUnreadBadge } from '@/hooks/useUnreadBridge';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

export const ChatsTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { filter } = useChatsFromUrl();
  const usersBadge = useChatsSubtabUnreadBadge('users');
  const marketBadge = useChatsSubtabUnreadBadge('market');
  const channelsBadge = useChatsSubtabUnreadBadge('channels');
  const bugsBadge = useChatsSubtabUnreadBadge('bugs');

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
    { id: 'users', label: t('chats.chats', { defaultValue: 'Chats' }), icon: Users, badge: usersBadge },
    { id: 'market', label: t('bottomTab.marketplace', { defaultValue: 'Market' }), icon: Package, badge: marketBadge },
    { id: 'channels', label: t('chats.channels', { defaultValue: 'Channels' }), icon: Hash, badge: channelsBadge },
    { id: 'bugs', label: t('chats.bugs', { defaultValue: 'Bugs' }), icon: Bug, badge: bugsBadge },
  ];

  return (
    <SegmentedSwitch
      tabs={tabs}
      activeId={filter}
      onChange={handleFilter}
      showOnlyActiveTabText
      layoutId="chatsSubtab"
    />
  );
};
