import type { ChatContextType } from '@/api/chat';
import { usePlayersStore } from '@/store/playersStore';
import { useHeaderStore } from '@/store/headerStore';
import { patchThreadIndexSetUnreadCount } from '@/services/chat/chatThreadIndex';

export const OPTIMISTIC_CLEAR_GAME_UNREAD_EVENT = 'bandeja-optimistic-clear-game-unread';
export const RESTORE_GAME_UNREAD_EVENT = 'bandeja-restore-game-unread';

export function dispatchRestoreGameUnreadCount(gameId: string, unreadCount: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RESTORE_GAME_UNREAD_EVENT, { detail: { gameId, unreadCount } }));
}

export const RESTORE_GROUP_UNREAD_EVENT = 'bandeja-restore-group-unread';

export function dispatchRestoreGroupUnreadCount(channelId: string, unreadCount: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RESTORE_GROUP_UNREAD_EVENT, { detail: { channelId, unreadCount } }));
}

export function applyOptimisticMarkContextRead(contextType: ChatContextType, contextId: string): number {
  if (contextType === 'USER') {
    const prev = usePlayersStore.getState().unreadCounts[contextId] ?? 0;
    if (prev > 0) {
      const { unreadMessages, setUnreadMessages } = useHeaderStore.getState();
      setUnreadMessages(Math.max(0, unreadMessages - prev));
    }
    usePlayersStore.getState().markChatAsRead(contextId);
    return prev;
  }
  if (contextType === 'GROUP') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chat-viewing-clear-unread', { detail: { contextType: 'GROUP', contextId } })
      );
    }
    return 0;
  }
  return 0;
}

export function applyOptimisticMarkGameRead(gameId: string): void {
  void patchThreadIndexSetUnreadCount('GAME', gameId, 0);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPTIMISTIC_CLEAR_GAME_UNREAD_EVENT, { detail: { gameId } }));
  }
}
