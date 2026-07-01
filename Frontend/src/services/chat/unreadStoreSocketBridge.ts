import type { ContextKey, SocketContextType, UnreadAuthorityClock } from '@/services/chat/unreadSnapshot';
import { useUnreadStore } from '@/store/unreadStore';

export type UnreadSocketDelta = {
  contextType: SocketContextType;
  contextId: string;
  unreadCount: number;
  contextKey?: ContextKey;
  clock?: UnreadAuthorityClock;
  clientOpId?: string;
};

export type UnreadInvalidatePayload = {
  userUnreadRevision: number;
  reason: 'auto_read' | 'repair' | 'mark_all_read';
};

/** Sync ingress for `chat:unread-count` — avoids dynamic import from socketEventsStore. */
export function applyUnreadSocketDelta(delta: UnreadSocketDelta): void {
  useUnreadStore.getState().applySocketDelta(delta);
}

/** Sync ingress for `chat:unread-invalidate` — triggers deduped snapshot repair. */
export function applyUnreadInvalidate(payload: UnreadInvalidatePayload): void {
  useUnreadStore.getState().onUserInvalidated(payload);
}
