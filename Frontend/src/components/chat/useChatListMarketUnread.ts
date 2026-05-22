import { useMemo } from 'react';
import { groupUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import { useUnreadStoreWarm } from '@/hooks/useUnreadBridge';
import { useUnreadStore } from '@/store/unreadStore';
import type { ChatsFilterType } from '@/components/chat/chatListModuleCache';
import type { ChatItem } from './chatListTypes';

export function useChatListMarketUnread(chatsFilter: ChatsFilterType, chats: ChatItem[]) {
  const warm = useUnreadStoreWarm();
  const byContext = useUnreadStore((s) => s.byContext);
  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? chats.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, chats]
  );
  const marketChannelIdsKey = useMemo(() => {
    if (chatsFilter !== 'market' || marketChannelIds.length === 0) return '';
    return [...marketChannelIds].sort().join(',');
  }, [chatsFilter, marketChannelIds]);
  const marketUnreadCounts = useMemo(
    () => (warm ? groupUnreadCountsMap(marketChannelIds, byContext) : {}),
    [warm, marketChannelIds, byContext]
  );
  return { marketChannelIdsKey, marketUnreadCounts };
}
