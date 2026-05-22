import { create } from 'zustand';
import { chatApi } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import { effectiveSocketUnreadCount } from '@/services/chat/unreadViewingGuard';
import { usePlayersStore } from '@/store/playersStore';
import { runUnreadSnapshotSideEffects } from '@/services/chat/unreadSnapshotSideEffects';
import {
  type ChatsSubtabFilter,
  type ComputeTotalsMeta,
  type ContextKey,
  type GroupChannelMeta,
  type SnapshotContextType,
  type SocketContextType,
  type UnreadSnapshotDto,
  type UnreadTotals,
  byContextFromSnapshotDto,
  computeTotals,
  contextKey,
  emptyUnreadTotals,
  hydrateGroupChannelMetaFromPayload,
  listItemToContextKey,
  marketBuyerSellerUnreadFromContext,
  mergeServerTotals,
  normalizeSocketContextToKey,
  selectBottomTabChatsBadgeFromTotals,
  selectChatsSubtabBadgeFromTotals,
  sumGameContextUnread,
} from '@/services/chat/unreadSnapshot';

export type { ChatsSubtabFilter } from '@/services/chat/unreadSnapshot';

export type EnterContextParams = {
  contextType: SnapshotContextType;
  contextId: string;
  game?: { id: string; status: string };
  participant?: { status: string; role: string } | null;
  parentParticipant?: { role: string } | null;
  isParentGameAdminOrOwner?: boolean;
};

type UnreadStoreState = {
  version: number;
  fetchedAt: number;
  byContext: Record<ContextKey, number>;
  totals: UnreadTotals;
  groupChannelMeta: Record<string, GroupChannelMeta>;
  mutedGroupIds: Set<string>;
  markInFlight: Set<ContextKey>;
  lastEnteredContextKey: ContextKey | null;
  refreshInFlight: Promise<void> | null;

  refreshAll: () => Promise<void>;
  setSnapshot: (dto: UnreadSnapshotDto) => void;
  applySocketDelta: (d: {
    contextType: SocketContextType;
    contextId: string;
    unreadCount: number;
  }) => void;
  enterContextAndMarkRead: (params: EnterContextParams) => Promise<void>;
  markAllRead: () => Promise<void>;
  restoreContext: (key: ContextKey, count: number) => void;
  patchGroupChannelMeta: (channelId: string, patch: GroupChannelMeta) => void;
  setMutedGroupIds: (ids: Iterable<string>) => void;
  reset: () => void;
};

function recomputeStateSlice(
  byContext: Record<ContextKey, number>,
  meta: ComputeTotalsMeta
): Pick<UnreadStoreState, 'byContext' | 'totals'> {
  return {
    byContext,
    totals: computeTotals(byContext, meta),
  };
}

function setContextUnreadInMap(
  byContext: Record<ContextKey, number>,
  key: ContextKey,
  next: number
): Record<ContextKey, number> {
  const out = { ...byContext };
  if (next <= 0) {
    delete out[key];
  } else {
    out[key] = next;
  }
  return out;
}

export const useUnreadStore = create<UnreadStoreState>((set, get) => ({
  version: 0,
  fetchedAt: 0,
  byContext: {},
  totals: emptyUnreadTotals(),
  groupChannelMeta: {},
  mutedGroupIds: new Set(),
  markInFlight: new Set(),
  lastEnteredContextKey: null,
  refreshInFlight: null,

  setSnapshot: (dto) => {
    const groupChannelMeta = {
      ...get().groupChannelMeta,
      ...hydrateGroupChannelMetaFromPayload(dto),
    };
    const byContext = byContextFromSnapshotDto(dto);
    const meta: ComputeTotalsMeta = {
      groupChannelMeta,
      mutedGroupIds: get().mutedGroupIds,
    };
    const computed = computeTotals(byContext, meta);
    set({
      version: dto.version ?? Date.now(),
      fetchedAt: Date.now(),
      byContext,
      groupChannelMeta,
      totals: mergeServerTotals(computed, dto.totals),
    });
    runUnreadSnapshotSideEffects({ ...dto, byContext, totals: get().totals, version: get().version });
  },

  refreshAll: async () => {
    const existing = get().refreshInFlight;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const envelope = await chatApi.getUnreadSnapshot();
        const dto = envelope.data;
        if (dto) get().setSnapshot(dto);
      } finally {
        set({ refreshInFlight: null });
      }
    })();

    set({ refreshInFlight: promise });
    return promise;
  },

  applySocketDelta: ({ contextType, contextId, unreadCount }) => {
    const { groupChannelMeta, mutedGroupIds, byContext } = get();
    const key = normalizeSocketContextToKey(contextType, contextId, groupChannelMeta);
    if (!key) return;

    const parsed = key.split(':')[0] as SnapshotContextType;
    const id = key.slice(key.indexOf(':') + 1);
    const next = effectiveSocketUnreadCount(parsed, id, unreadCount);

    const meta: ComputeTotalsMeta = { groupChannelMeta, mutedGroupIds };
    const nextByContext = setContextUnreadInMap(byContext, key, next);
    set(recomputeStateSlice(nextByContext, meta));
  },

  enterContextAndMarkRead: async (params) => {
    const { enterContextAndMarkRead } = await import('@/services/chat/unreadCoordinator');
    await enterContextAndMarkRead(params);
  },

  markAllRead: async () => {
    try {
      const envelope = await chatApi.markAllRead();
      const dto = envelope.data;
      if (dto && (dto.byContext || dto.totals)) {
        get().setSnapshot(dto);
        return;
      }
      set({
        version: Date.now(),
        fetchedAt: Date.now(),
        byContext: {},
        totals: emptyUnreadTotals(),
      });
    } catch (err) {
      console.error('[unreadStore] markAllRead failed', err);
      throw err;
    }
  },

  restoreContext: (key, count) => {
    const meta: ComputeTotalsMeta = {
      groupChannelMeta: get().groupChannelMeta,
      mutedGroupIds: get().mutedGroupIds,
    };
    const nextByContext = setContextUnreadInMap(get().byContext, key, count);
    set({
      ...recomputeStateSlice(nextByContext, meta),
      lastEnteredContextKey: null,
    });
  },

  patchGroupChannelMeta: (channelId, patch) => {
    const groupChannelMeta = {
      ...get().groupChannelMeta,
      [channelId]: { ...get().groupChannelMeta[channelId], ...patch },
    };
    const meta: ComputeTotalsMeta = { groupChannelMeta, mutedGroupIds: get().mutedGroupIds };
    set({ groupChannelMeta, ...recomputeStateSlice(get().byContext, meta) });
  },

  setMutedGroupIds: (ids) => {
    const mutedGroupIds = new Set(ids);
    const meta: ComputeTotalsMeta = { groupChannelMeta: get().groupChannelMeta, mutedGroupIds };
    set({ mutedGroupIds, ...recomputeStateSlice(get().byContext, meta) });
  },

  reset: () => {
    set({
      version: 0,
      fetchedAt: 0,
      byContext: {},
      totals: emptyUnreadTotals(),
      groupChannelMeta: {},
      mutedGroupIds: new Set(),
      markInFlight: new Set(),
      lastEnteredContextKey: null,
      refreshInFlight: null,
    });
  },
}));

// --- Selectors (§5.1) ---

export type UnreadChatContextType = SnapshotContextType;

export function isUnreadStoreWarm(state: UnreadStoreState): boolean {
  return state.fetchedAt > 0;
}

export function selectTotalAll(state: UnreadStoreState = useUnreadStore.getState()): number {
  return state.totals.all;
}

export function selectBottomTabChatsBadge(state: UnreadStoreState = useUnreadStore.getState()): number {
  return selectBottomTabChatsBadgeFromTotals(state.totals);
}

export function selectBottomTabMyGamesBadge(state: UnreadStoreState = useUnreadStore.getState()): number {
  return state.totals.myGames > 0 ? state.totals.myGames : state.totals.games;
}

export function selectBottomTabMarketplaceBadge(state: UnreadStoreState = useUnreadStore.getState()): number {
  return state.totals.marketplace;
}

export function selectChatsSubtabBadge(
  filter: ChatsSubtabFilter,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return selectChatsSubtabBadgeFromTotals(filter, state.totals);
}

export function selectContextUnread(
  contextType: SnapshotContextType,
  contextId: string,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return state.byContext[contextKey(contextType, contextId)] ?? 0;
}

export function selectMyGamesUnread(state: UnreadStoreState = useUnreadStore.getState()): number {
  return state.totals.myGames > 0 ? state.totals.myGames : state.totals.games;
}

export function selectPastGamesUnread(
  gameIds: string[],
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  if (state.totals.pastGames > 0) return state.totals.pastGames;
  return sumGameContextUnread(state.byContext, gameIds);
}

export function selectMarketBuyerUnread(
  currentUserId: string | undefined,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return marketBuyerSellerUnreadFromContext(state.byContext, state.groupChannelMeta, currentUserId).buyer;
}

export function selectMarketSellerUnread(
  currentUserId: string | undefined,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return marketBuyerSellerUnreadFromContext(state.byContext, state.groupChannelMeta, currentUserId).seller;
}

export function selectUnreadByUserId(
  userId: string,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  const chatId = usePlayersStore.getState().userIdToChatId[userId];
  if (!chatId) return 0;
  return state.byContext[contextKey('USER', chatId)] ?? 0;
}

export function selectContextUnreadForListItem(
  item: ChatItem,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  const key = listItemToContextKey(item);
  const fallback = 'unreadCount' in item ? (item.unreadCount ?? 0) : 0;
  if (!key) return fallback;
  return state.byContext[key] ?? fallback;
}

export const unreadStoreSelectors = {
  selectTotalAll,
  selectBottomTabChatsBadge,
  selectBottomTabMyGamesBadge,
  selectBottomTabMarketplaceBadge,
  selectChatsSubtabBadge,
  selectContextUnread,
  selectMyGamesUnread,
  selectPastGamesUnread,
  selectMarketBuyerUnread,
  selectMarketSellerUnread,
  selectUnreadByUserId,
  selectContextUnreadForListItem,
} as const;
