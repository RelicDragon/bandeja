/**
 * UI selectors over unreadStore (single source for badges).
 */
import { useShallow } from 'zustand/react/shallow';
import type { ChatItem } from '@/utils/chatListSort';
import { gameUnreadCountsMap, marketItemUnreadCount } from '@/utils/unreadCountsFromStore';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import {
  isUnreadStoreWarm,
  selectBottomTabChatsBadge,
  selectBottomTabMarketplaceBadge,
  selectBottomTabMyGamesBadge,
  selectChatsSubtabBadge,
  selectContextUnread,
  selectContextUnreadForListItem,
  selectMarketBuyerUnread,
  selectMarketSellerUnread,
  selectMyGamesUnread,
  selectPastGamesUnread,
  selectTotalAll,
  type ChatsSubtabFilter,
  type UnreadChatContextType,
  useUnreadStore,
} from '@/store/unreadStore';

export type TabUnreadBadge = number | undefined;

export function useUnreadStoreWarm(): boolean {
  return useUnreadStore((s) => isUnreadStoreWarm(s));
}

export function useBottomTabUnreadBadges(): {
  my: TabUnreadBadge;
  chats: TabUnreadBadge;
  market: TabUnreadBadge;
} {
  return useUnreadStore(
    useShallow((s) => {
      if (!isUnreadStoreWarm(s)) {
        return { my: undefined, chats: undefined, market: undefined };
      }
      return {
        my: selectBottomTabMyGamesBadge(s),
        chats: selectBottomTabChatsBadge(s),
        market: selectBottomTabMarketplaceBadge(s),
      };
    })
  );
}

export function useChatsSubtabUnreadBadge(filter: ChatsSubtabFilter): TabUnreadBadge {
  const warm = useUnreadStoreWarm();
  const count = useUnreadStore((s) => selectChatsSubtabBadge(filter, s));
  return warm ? count : undefined;
}

export function useTotalUnreadForMarkAllBanner(): number {
  return useUnreadStore((s) => selectTotalAll(s));
}

export function useContextUnread(
  contextType: UnreadChatContextType,
  contextId: string | undefined,
  propFallback = 0
): number {
  const warm = useUnreadStore((s) => isUnreadStoreWarm(s));
  const fromStore = useUnreadStore((s) =>
    contextId ? selectContextUnread(contextType, contextId, s) : 0
  );
  if (!contextId) return propFallback;
  return warm ? fromStore : propFallback;
}

export function useGameUnreadCountsForIds(
  gameIds: readonly string[],
  propFallback: Record<string, number> = {}
): Record<string, number> {
  const warm = useUnreadStoreWarm();
  const fromStore = useUnreadStore(
    useShallow((s) => gameUnreadCountsMap([...gameIds], s.displayedByContext))
  );
  return warm ? fromStore : propFallback;
}

export function useMyGamesSubtabUnreadBadges(): {
  myGames: TabUnreadBadge;
  pastGames: TabUnreadBadge;
} {
  return useUnreadStore(
    useShallow((s) => {
      if (!isUnreadStoreWarm(s)) {
        return { myGames: undefined, pastGames: undefined };
      }
      return {
        myGames: selectMyGamesUnread(s),
        pastGames: selectPastGamesUnread([], s),
      };
    })
  );
}

export function useChatListItemUnread(item: ChatItem): number {
  const warm = useUnreadStoreWarm();
  const fromStore = useUnreadStore((s) => selectContextUnreadForListItem(item, s, { warm }));
  if (warm) return fromStore;
  return 'unreadCount' in item ? (item.unreadCount ?? 0) : 0;
}

export function useMarketItemUnread(
  item: { groupChannel?: { id: string }; groupChannels?: { id: string }[] },
  legacyByChannelId: Record<string, number> = {}
): number {
  const warm = useUnreadStoreWarm();
  const count = useUnreadStore((s) => marketItemUnreadCount(item, s.displayedByContext));
  if (!warm) {
    if (item.groupChannel) return legacyByChannelId[item.groupChannel.id] ?? 0;
    return (item.groupChannels ?? []).reduce((sum, channel) => sum + (legacyByChannelId[channel.id] ?? 0), 0);
  }
  return count;
}

export function useMarketBuyerSellerUnreadBadges(): {
  buyer: TabUnreadBadge;
  seller: TabUnreadBadge;
} {
  const userId = useAuthStore((s) => s.user?.id);
  return useUnreadStore(
    useShallow((s) => {
      if (!isUnreadStoreWarm(s)) {
        return { buyer: undefined, seller: undefined };
      }
      return {
        buyer: selectMarketBuyerUnread(userId, s),
        seller: selectMarketSellerUnread(userId, s),
      };
    })
  );
}

export function useUnreadByUserIdBridge(userId: string | undefined, propFallback = 0): number {
  const warm = useUnreadStoreWarm();
  const chatId = usePlayersStore((s) => (userId ? s.userIdToChatId[userId] : undefined));
  const fromStore = useUnreadStore((s) =>
    chatId ? selectContextUnread('USER', chatId, s) : 0
  );
  if (!userId) return propFallback;
  return warm ? fromStore : propFallback;
}
