import { useAuthStore } from '@/store/authStore';
import { useUnreadStore } from '@/store/unreadStore';
import {
  parseContextKey,
  resolveSocketContextKey,
  type ContextKey,
  type SocketContextType,
} from '@/services/chat/unreadSnapshot';
import { shouldSuppressUnreadForOpenContext } from '@/services/chat/unreadViewingGuard';

export type InboundMessageSeenParams = {
  contextType: SocketContextType | string;
  contextId: string;
  messageId: string;
  senderId: string;
};

/** Socket/sync ingress for optimistic unread receive (Phase 4). */
export function notifyInboundMessageSeen(params: InboundMessageSeenParams): void {
  const { contextType, contextId, messageId, senderId } = params;
  if (!messageId || !senderId) return;

  const selfId = useAuthStore.getState().user?.id;
  if (!selfId || senderId === selfId) return;

  const state = useUnreadStore.getState();
  const key = resolveSocketContextKey({
    contextType: contextType as SocketContextType,
    contextId,
    groupChannelMeta: state.groupChannelMeta,
  });
  if (!key) return;

  const parsed = parseContextKey(key);
  if (parsed && shouldSuppressUnreadForOpenContext(parsed.contextType, parsed.contextId)) return;

  useUnreadStore.getState().onInboundMessageSeen({ contextKey: key, messageId, senderId });
}

export function resolveInboundContextKey(
  contextType: SocketContextType | string,
  contextId: string
): ContextKey | null {
  const state = useUnreadStore.getState();
  return resolveSocketContextKey({
    contextType: contextType as SocketContextType,
    contextId,
    groupChannelMeta: state.groupChannelMeta,
  });
}
