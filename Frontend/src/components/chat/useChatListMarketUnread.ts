import { useMemo } from 'react';
import { useGroupChannelUnreadCounts } from '@/hooks/useGroupChannelUnreadCounts';
import type { ChatsFilterType } from '@/components/chat/chatListModuleCache';
import type { ChatItem } from './chatListTypes';

export function useChatListMarketUnread(chatsFilter: ChatsFilterType, chats: ChatItem[]) {
  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? chats.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, chats]
  );
  const marketChannelIdsKey = useMemo(() => {
    if (chatsFilter !== 'market' || marketChannelIds.length === 0) return '';
    return [...marketChannelIds].sort().join(',');
  }, [chatsFilter, marketChannelIds]);
  const marketUnreadCounts = useGroupChannelUnreadCounts(marketChannelIds);
  return { marketChannelIdsKey, marketUnreadCounts };
}
