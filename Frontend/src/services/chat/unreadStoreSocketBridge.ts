import type { SocketContextType } from '@/services/chat/unreadSnapshot';
import { useUnreadStore } from '@/store/unreadStore';

export type UnreadSocketDelta = {
  contextType: SocketContextType;
  contextId: string;
  unreadCount: number;
};

/** Sync ingress for `chat:unread-count` — avoids dynamic import from socketEventsStore. */
export function applyUnreadSocketDelta(delta: UnreadSocketDelta): void {
  useUnreadStore.getState().applySocketDelta(delta);
}
