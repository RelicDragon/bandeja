/**
 * UI selectors over unreadStore (single source for badges).
 */
import { useShallow } from 'zustand/react/shallow';
import type { ChatItem } from '@/utils/chatListSort';
import { contextKey } from '@/services/chat/unreadSnapshot';
import { gameUnreadCountsMap } from '@/utils/unreadCountsFromStore';
import { useAuthStore } from '@/store/authStore';
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
  selectTotalAll,
  selectUnreadByUserId,
  type ChatsSubtabFilter,
  type UnreadChatContextType,
  useUnreadStore,
} from '@/store/unreadStore';

export function useUnreadStoreWarm(): boolean {
  return useUnreadStore((s) => isUnreadStoreWarm(s));
}

export function useBottomTabUnreadBadges() {
  return useUnreadStore(
    useShallow((s) => ({
      my: selectBottomTabMyGamesBadge(s),
      chats: selectBottomTabChatsBadge(s),
      market: selectBottomTabMarketplaceBadge(s),
    }))
  );
}

export function useChatsSubtabUnreadBadge(filter: ChatsSubtabFilter): number {
  return useUnreadStore((s) => selectChatsSubtabBadge(filter, s));
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

export function useGameUnreadCountsForIds(gameIds: readonly string[]): Record<string, number> {
  return useUnreadStore(
    useShallow((s) => gameUnreadCountsMap([...gameIds], s.byContext))
  );
}

export function useMyGamesSubtabUnreadBadges() {
  return useUnreadStore(
    useShallow((s) => ({
      myGames: selectMyGamesUnread(s),
      pastGames: s.totals.pastGames,
    }))
  );
}

export function useChatListItemUnread(item: ChatItem): number {
  const warm = useUnreadStoreWarm();
  const fromStore = useUnreadStore((s) => selectContextUnreadForListItem(item, s));
  if (warm) return fromStore;
  return 'unreadCount' in item ? (item.unreadCount ?? 0) : 0;
}

export function useMarketItemUnread(
  item: { groupChannel?: { id: string }; groupChannels?: { id: string }[] },
  _legacyByChannelId: Record<string, number> = {}
): number {
  const warm = useUnreadStoreWarm();
  const byContext = useUnreadStore((s) => s.byContext);
  if (!warm) return 0;
  if (item.groupChannel) {
    return byContext[contextKey('GROUP', item.groupChannel.id)] ?? 0;
  }
  return (item.groupChannels ?? []).reduce(
    (s, c) => s + (byContext[contextKey('GROUP', c.id)] ?? 0),
    0
  );
}

export function useMarketBuyerSellerUnreadBadges(): { buyer: number; seller: number } {
  const userId = useAuthStore((s) => s.user?.id);
  return useUnreadStore(
    useShallow((s) => ({
      buyer: selectMarketBuyerUnread(userId, s),
      seller: selectMarketSellerUnread(userId, s),
    }))
  );
}

export function useUnreadByUserIdBridge(userId: string | undefined, propFallback = 0): number {
  const warm = useUnreadStoreWarm();
  const fromStore = useUnreadStore((s) =>
    userId ? selectUnreadByUserId(userId, s) : 0
  );
  if (!userId) return propFallback;
  return warm ? fromStore : propFallback;
}
