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
    () =>
      chatsFilter === 'market'
        ? chats.filter((c): c is Extract<ChatItem, { type: 'channel' }> => c.type === 'channel').map((c) => c.data.id)
        : [],
    [chatsFilter, chats]
  );
  // Subscribe to a shallow-stable record of ONLY the visible market channels,
  // not the whole byContext map, so this re-renders only when one of these
  // channels' counts changes.
  const marketUnreadCounts = useUnreadStore(
    useShallow((s) => (warm ? groupUnreadCountsMap(marketChannelIds, s.displayedByContext) : {}))
  );
  return { marketUnreadCounts };
}
