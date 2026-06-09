import type { ChatContextType } from '@/api/chat';
import { chatCursorKey } from './chatLocalDb';

const PREFETCH_SKIP_RECONCILE_MS = 8_000;

const prefetchedAtByCursorKey = new Map<string, number>();

export function markOpenThreadNetworkPrefetched(
  contextType: ChatContextType,
  contextId: string
): void {
  prefetchedAtByCursorKey.set(chatCursorKey(contextType, contextId), Date.now());
}

export function consumeOpenThreadNetworkPrefetch(
  contextType: ChatContextType,
  contextId: string
): boolean {
  const key = chatCursorKey(contextType, contextId);
  const at = prefetchedAtByCursorKey.get(key);
  if (at == null) return false;
  prefetchedAtByCursorKey.delete(key);
  return Date.now() - at <= PREFETCH_SKIP_RECONCILE_MS;
}

export function clearOpenThreadNetworkPrefetch(): void {
  prefetchedAtByCursorKey.clear();
}
