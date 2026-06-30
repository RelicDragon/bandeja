import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { groupUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import { useUnreadStoreWarm } from '@/hooks/useUnreadBridge';
import { useUnreadStore } from '@/store/unreadStore';
import type { ChatsFilterType } from '@/components/chat/chatListModuleCache';
import type { ChatItem } from './chatListTypes';

export function useChatListMarketUnread(chatsFilter: ChatsFilterType, chats: ChatItem[]) {
  const warm = useUnreadStoreWarm();
  const marketChannelIds = useMemo(
    () => (chatsFilter === 'market' ? chats.filter((c) => c.type === 'channel').map((c) => c.data.id) : []),
    [chatsFilter, chats]
  );
  const marketChannelIdsKey = useMemo(() => {
    if (chatsFilter !== 'market' || marketChannelIds.length === 0) return '';
    return [...marketChannelIds].sort().join(',');
  }, [chatsFilter, marketChannelIds]);
  // Subscribe to a shallow-stable record of ONLY the visible market channels,
  // not the whole byContext map, so this re-renders only when one of these
  // channels' counts changes.
  const marketUnreadCounts = useUnreadStore(
    useShallow((s) => (warm ? groupUnreadCountsMap(marketChannelIds, s.byContext) : {}))
  );
  return { marketChannelIdsKey, marketUnreadCounts };
}
