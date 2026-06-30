import type { ChatsSubtabFilter } from '@/services/chat/unreadSnapshot';
import type { TabUnreadBadge } from '@/hooks/useUnreadBridge';

export type ChatListSubtabUnreadBadges = Record<ChatsSubtabFilter, TabUnreadBadge>;

/** Unread count for the mail filter control — authoritative snapshot only. */
export function chatListUnreadFilterCount(
  unreadStoreWarm: boolean,
  chatsFilter: ChatsSubtabFilter,
  badges: ChatListSubtabUnreadBadges
): number {
  if (!unreadStoreWarm) return 0;
  return badges[chatsFilter] ?? 0;
}

/** Mail filter is mounted only when this is true — avoids a visible "0" badge. */
export function shouldShowChatListUnreadFilter(unreadChatsCount: number): boolean {
  return unreadChatsCount > 0;
}
