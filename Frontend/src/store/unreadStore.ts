import { create } from 'zustand';
import { chatApi } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import { effectiveSocketUnreadCount } from '@/services/chat/unreadViewingGuard';
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
  applyScopedGameTotals,
  bugIdToChannelIdFromSnapshot,
  byContextFromSnapshotDto,
  computeTotals,
  contextKey,
  emptyUnreadTotals,
  hydrateBugMetaFromGroupChannels,
  hydrateGroupChannelMetaFromPayload,
  listItemToContextKey,
  marketBuyerSellerUnreadFromContext,
  mergeServerTotals,
  normalizeSocketContextToKey,
  parseContextKey,
  selectBottomTabChatsBadgeFromTotals,
  selectChatsSubtabBadgeFromTotals,
  sumGameContextUnread,
} from '@/services/chat/unreadSnapshot';
import { applyUnresolvedBugSocketDelta } from '@/services/chat/unreadBugSocketDelta';

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
  bugIdToChannelId: Record<string, string>;
  mutedGroupIds: Set<string>;
  myGameIds: Set<string>;
  pastGameIds: Set<string>;
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
  registerBugChannels: (
    channels: ReadonlyArray<{ id: string; bugId?: string | null; bug?: { id?: string } | null }>
  ) => void;
  setMutedGroupIds: (ids: Iterable<string>) => void;
  toggleMutedGroupId: (channelId: string, muted: boolean) => void;
  setMyGamesScope: (myGameIds: Iterable<string>, pastGameIds: Iterable<string>) => void;
  reset: () => void;
};

function buildComputeMeta(state: Pick<
  UnreadStoreState,
  'groupChannelMeta' | 'mutedGroupIds' | 'myGameIds' | 'pastGameIds'
>): ComputeTotalsMeta {
  return {
    groupChannelMeta: state.groupChannelMeta,
    mutedGroupIds: state.mutedGroupIds,
    myGameIds: state.myGameIds,
    pastGameIds: state.pastGameIds,
  };
}

function recomputeStateSlice(
  byContext: Record<ContextKey, number>,
  meta: ComputeTotalsMeta
): Pick<UnreadStoreState, 'byContext' | 'totals'> {
  const base = computeTotals(byContext, meta);
  return {
    byContext,
    totals: applyScopedGameTotals(base, byContext, meta),
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
  bugIdToChannelId: {},
  mutedGroupIds: new Set(),
  myGameIds: new Set(),
  pastGameIds: new Set(),
  markInFlight: new Set(),
  lastEnteredContextKey: null,
  refreshInFlight: null,

  setSnapshot: (dto) => {
    const groupChannelMeta = {
      ...get().groupChannelMeta,
      ...hydrateGroupChannelMetaFromPayload(dto),
    };
    const bugIdToChannelId = {
      ...get().bugIdToChannelId,
      ...bugIdToChannelIdFromSnapshot(dto),
    };
    const byContext = byContextFromSnapshotDto(dto);
    // Preserve client-side mute toggles when a snapshot omits mutedGroupIds
    // (e.g. a mark-all-read envelope); otherwise muted channels re-enter totals.
    const mutedGroupIds = dto.mutedGroupIds ? new Set(dto.mutedGroupIds) : get().mutedGroupIds;
    const meta: ComputeTotalsMeta = {
      groupChannelMeta,
      mutedGroupIds,
      myGameIds: get().myGameIds,
      pastGameIds: get().pastGameIds,
    };
    const computed = applyScopedGameTotals(computeTotals(byContext, meta), byContext, meta);
    set({
      version: dto.version ?? Date.now(),
      fetchedAt: Date.now(),
      byContext,
      groupChannelMeta,
      bugIdToChannelId,
      mutedGroupIds,
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
    const state = get();
    const { groupChannelMeta, byContext, bugIdToChannelId } = state;
    const key = normalizeSocketContextToKey(
      contextType,
      contextId,
      groupChannelMeta,
      bugIdToChannelId
    );
    if (!key) {
      if (contextType === 'BUG') {
        applyUnresolvedBugSocketDelta(contextId, unreadCount);
      }
      return;
    }

    if (unreadCount > 0) {
      void import('@/services/chat/unreadCoordinator').then((m) => m.invalidateMarkReadConfirmed(key));
    }

    const parsed = parseContextKey(key);
    if (!parsed) return;
    const next = effectiveSocketUnreadCount(parsed.contextType, parsed.contextId, unreadCount);

    const meta = buildComputeMeta(state);
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
    const state = get();
    const meta = buildComputeMeta(state);
    const nextByContext = setContextUnreadInMap(state.byContext, key, count);
    set({
      ...recomputeStateSlice(nextByContext, meta),
      lastEnteredContextKey: null,
    });
  },

  patchGroupChannelMeta: (channelId, patch) => {
    const state = get();
    const groupChannelMeta = {
      ...state.groupChannelMeta,
      [channelId]: { ...state.groupChannelMeta[channelId], ...patch },
    };
    const meta = buildComputeMeta({ ...state, groupChannelMeta });
    set({ groupChannelMeta, ...recomputeStateSlice(state.byContext, meta) });
  },

  registerBugChannels: (channels) => {
    if (channels.length === 0) return;
    const state = get();
    const hydrated = hydrateBugMetaFromGroupChannels(channels);
    const groupChannelMeta = { ...state.groupChannelMeta };
    for (const [channelId, patch] of Object.entries(hydrated.groupChannelMeta)) {
      groupChannelMeta[channelId] = { ...groupChannelMeta[channelId], ...patch };
    }
    const bugIdToChannelId = { ...state.bugIdToChannelId, ...hydrated.bugIdToChannelId };
    const meta = buildComputeMeta({ ...state, groupChannelMeta });
    set({ groupChannelMeta, bugIdToChannelId, ...recomputeStateSlice(state.byContext, meta) });
  },

  setMutedGroupIds: (ids) => {
    const state = get();
    const mutedGroupIds = new Set(ids);
    const meta = buildComputeMeta({ ...state, mutedGroupIds });
    set({ mutedGroupIds, ...recomputeStateSlice(state.byContext, meta) });
  },

  toggleMutedGroupId: (channelId, muted) => {
    const state = get();
    const mutedGroupIds = new Set(state.mutedGroupIds);
    if (muted) mutedGroupIds.add(channelId);
    else mutedGroupIds.delete(channelId);
    const meta = buildComputeMeta({ ...state, mutedGroupIds });
    set({ mutedGroupIds, ...recomputeStateSlice(state.byContext, meta) });
  },

  setMyGamesScope: (myGameIds, pastGameIds) => {
    const state = get();
    const nextMy = new Set(myGameIds);
    const nextPast = new Set(pastGameIds);
    const meta = buildComputeMeta({
      ...state,
      myGameIds: nextMy,
      pastGameIds: nextPast,
    });
    set({
      myGameIds: nextMy,
      pastGameIds: nextPast,
      ...recomputeStateSlice(state.byContext, meta),
    });
  },

  reset: () => {
    set({
      version: 0,
      fetchedAt: 0,
      byContext: {},
      totals: emptyUnreadTotals(),
      groupChannelMeta: {},
      bugIdToChannelId: {},
      mutedGroupIds: new Set(),
      myGameIds: new Set(),
      pastGameIds: new Set(),
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
  return selectMyGamesUnread(state);
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
  if (state.myGameIds.size > 0) return state.totals.myGames;
  return state.totals.myGames > 0 ? state.totals.myGames : state.totals.games;
}

export function selectPastGamesUnread(
  gameIds: string[],
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  if (state.pastGameIds.size > 0) return state.totals.pastGames;
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

export function selectContextUnreadForListItem(
  item: ChatItem,
  state: UnreadStoreState = useUnreadStore.getState(),
  options?: { warm?: boolean }
): number {
  const key = listItemToContextKey(item);
  const fallback = 'unreadCount' in item ? (item.unreadCount ?? 0) : 0;
  if (!key) return fallback;
  const warm = options?.warm ?? isUnreadStoreWarm(state);
  if (warm) return state.byContext[key] ?? 0;
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
  selectContextUnreadForListItem,
} as const;
