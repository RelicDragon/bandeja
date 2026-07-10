import { contextKey, type ContextKey } from '@/services/chat/unreadSnapshot';
import { isUnreadStoreWarm, useUnreadStore } from '@/store/unreadStore';

export function gameUnreadCountsMap(
  gameIds: string[],
  byContext: Record<ContextKey, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of gameIds) {
    const n = byContext[contextKey('GAME', id)] ?? 0;
    if (n > 0) out[id] = n;
  }
  return out;
}

export function groupUnreadCountsMap(
  channelIds: string[],
  byContext: Record<ContextKey, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of channelIds) {
    const n = byContext[contextKey('GROUP', id)] ?? 0;
    if (n > 0) out[id] = n;
  }
  return out;
}

/** A marketplace listing with one explicit channel (single) or many (grouped by item). */
export type MarketUnreadItem = {
  groupChannel?: { id: string };
  groupChannels?: { id: string }[];
};

/**
 * Sum of unread across a market item's GROUP channel(s). Pure on `byContext` so it
 * can back a primitive zustand selector: the result only changes when THIS item's
 * channels change, letting `Object.is` skip re-renders for unrelated contexts.
 */
export function marketItemUnreadCount(
  item: MarketUnreadItem,
  byContext: Record<ContextKey, number>
): number {
  if (item.groupChannel) {
    return byContext[contextKey('GROUP', item.groupChannel.id)] ?? 0;
  }
  return (item.groupChannels ?? []).reduce(
    (sum, c) => sum + (byContext[contextKey('GROUP', c.id)] ?? 0),
    0
  );
}

async function ensureUnreadStoreWarm(): Promise<void> {
  if (isUnreadStoreWarm(useUnreadStore.getState())) return;
  await useUnreadStore.getState().refreshAll();
}

export async function resolveGameUnreadCounts(gameIds: string[]): Promise<Record<string, number>> {
  if (gameIds.length === 0) return {};
  await ensureUnreadStoreWarm();
  const state = useUnreadStore.getState();
  return gameUnreadCountsMap(gameIds, state.displayedByContext);
}

export async function resolveGroupUnreadCounts(channelIds: string[]): Promise<Record<string, number>> {
  if (channelIds.length === 0) return {};
  await ensureUnreadStoreWarm();
  const state = useUnreadStore.getState();
  return groupUnreadCountsMap(channelIds, state.displayedByContext);
}

export function userChatUnreadCount(chatId: string): number {
  const state = useUnreadStore.getState();
  if (!isUnreadStoreWarm(state)) return 0;
  return state.displayedByContext[contextKey('USER', chatId)] ?? 0;
}
