import { create } from 'zustand';
import { chatApi } from '@/api/chat';
import type { ChatItem } from '@/utils/chatListSort';
import {
  type ChatsSubtabFilter,
  type ContextKey,
  type GroupChannelMeta,
  type SnapshotContextType,
  type SocketContextType,
  type UnreadAuthorityClock,
  type UnreadSnapshotDto,
  type UnreadTotals,
  contextKey,
  emptyUnreadTotals,
  listItemToContextKey,
  marketBuyerSellerUnreadFromContext,
  resolveSocketContextKey,
  selectBottomTabChatsBadgeFromTotals,
  selectChatsSubtabBadgeFromTotals,
  sumGameContextUnread,
} from '@/services/chat/unreadSnapshot';
import { shouldSuppressUnreadForOpenContext } from '@/services/chat/unreadViewingGuard';
import {
  beginRefreshRepair,
  clearMarkInFlight,
  createInitialUnreadProjectionState,
  endRefreshRepair,
  reduceUnreadProjection,
  type EnterContextParams,
  type UnreadProjectionState,
} from '@/services/chat/unreadProjection';
import { runUnreadProjectionEffects } from '@/services/chat/unreadProjectionEffects';
import { syncAppIconBadgeFromStore } from '@/services/chat/syncAppIconBadgeFromStore';

export type { ChatsSubtabFilter } from '@/services/chat/unreadSnapshot';
export type { EnterContextParams };

const projectionConfig = {
  shouldSuppressDisplay: shouldSuppressUnreadForOpenContext,
};

type UnreadStoreState = UnreadProjectionState & {
  /** Legacy alias for baseByContext — kept in sync on every write. */
  byContext: Record<ContextKey, number>;
  refreshInFlight: Promise<void> | null;

  refreshAll: () => Promise<void>;
  onUserInvalidated: (payload: { userUnreadRevision: number; reason: string }) => void;
  setSnapshot: (dto: UnreadSnapshotDto) => void;
  applySocketDelta: (d: {
    contextType: SocketContextType;
    contextId: string;
    unreadCount: number;
    contextKey?: ContextKey;
    clock?: UnreadAuthorityClock;
    clientOpId?: string;
  }) => void;
  onInboundMessageSeen: (params: { contextKey: ContextKey; messageId: string; senderId: string }) => void;
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

function toStoreSlice(projection: UnreadProjectionState): UnreadProjectionState & { byContext: Record<ContextKey, number> } {
  return { ...projection, byContext: projection.baseByContext };
}

function dispatchProjection(
  state: UnreadProjectionState,
  event: Parameters<typeof reduceUnreadProjection>[1]
): ReturnType<typeof toStoreSlice> {
  const { state: next, effects } = reduceUnreadProjection(state, event, projectionConfig);
  runUnreadProjectionEffects(effects);
  return toStoreSlice(next);
}

function initialStoreState(): Omit<
  UnreadStoreState,
  | 'refreshAll'
  | 'onUserInvalidated'
  | 'setSnapshot'
  | 'applySocketDelta'
  | 'onInboundMessageSeen'
  | 'enterContextAndMarkRead'
  | 'markAllRead'
  | 'restoreContext'
  | 'patchGroupChannelMeta'
  | 'registerBugChannels'
  | 'setMutedGroupIds'
  | 'toggleMutedGroupId'
  | 'setMyGamesScope'
  | 'reset'
> {
  const projection = createInitialUnreadProjectionState();
  return { ...projection, byContext: projection.baseByContext, refreshInFlight: null };
}

export const useUnreadStore = create<UnreadStoreState>((set, get) => ({
  ...initialStoreState(),

  setSnapshot: (dto) => {
    set(dispatchProjection(get(), { type: 'snapshotReceived', snapshot: dto }));
  },

  refreshAll: async () => {
    const existing = get().refreshInFlight;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const envelope = await chatApi.getUnreadSnapshotObjects();
        const dto = envelope.data;
        if (dto) get().setSnapshot(dto);
      } finally {
        set({ ...endRefreshRepair(get()), refreshInFlight: null });
        syncAppIconBadgeFromStore();
      }
    })();

    set({ ...beginRefreshRepair(get()), refreshInFlight: promise });
    return promise;
  },

  onUserInvalidated: (payload) => {
    set(
      dispatchProjection(get(), {
        type: 'userInvalidated',
        userUnreadRevision: payload.userUnreadRevision,
        reason: payload.reason,
      })
    );
  },

  applySocketDelta: (delta) => {
    const state = get();
    const resolvedKey = resolveSocketContextKey({
      contextKey: delta.contextKey,
      contextType: delta.contextType,
      contextId: delta.contextId,
      groupChannelMeta: state.groupChannelMeta,
    });
    set(
      dispatchProjection(state, {
        type: 'authorityEnvelopeReceived',
        envelope: delta,
        resolvedKey,
      })
    );
  },

  onInboundMessageSeen: (params) => {
    set(
      dispatchProjection(get(), {
        type: 'inboundMessageSeen',
        contextKey: params.contextKey,
        messageId: params.messageId,
        senderId: params.senderId,
      })
    );
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
      set(
        dispatchProjection(get(), {
          type: 'snapshotReceived',
          snapshot: {
            games: [],
            userChats: [],
            groupChannels: [],
            bugs: [],
            marketItems: [],
            byContext: {},
            totals: emptyUnreadTotals(),
          },
        })
      );
    } catch (err) {
      console.error('[unreadStore] markAllRead failed', err);
      throw err;
    }
  },

  restoreContext: (key, count) => {
    const state = get();
    const nextBase = { ...state.baseByContext };
    if (count <= 0) delete nextBase[key];
    else nextBase[key] = count;
    const cleared = clearMarkInFlight(state, key);
    const optimistic = { ...cleared.optimistic };
    delete optimistic[key];
    const { state: reduced, effects } = reduceUnreadProjection(
      { ...cleared, optimistic, baseByContext: nextBase, lastEnteredContextKey: null },
      { type: 'metaPatch', patch: { kind: 'mutedGroupIds', ids: cleared.mutedGroupIds } },
      projectionConfig
    );
    runUnreadProjectionEffects(effects);
    set(toStoreSlice(reduced));
  },

  patchGroupChannelMeta: (channelId, patch) => {
    set(dispatchProjection(get(), { type: 'metaPatch', patch: { kind: 'groupChannelMeta', channelId, patch } }));
  },

  registerBugChannels: (channels) => {
    if (channels.length === 0) return;
    set(dispatchProjection(get(), { type: 'metaPatch', patch: { kind: 'registerBugChannels', channels } }));
  },

  setMutedGroupIds: (ids) => {
    set(dispatchProjection(get(), { type: 'metaPatch', patch: { kind: 'mutedGroupIds', ids } }));
  },

  toggleMutedGroupId: (channelId, muted) => {
    set(dispatchProjection(get(), { type: 'metaPatch', patch: { kind: 'toggleMutedGroupId', channelId, muted } }));
  },

  setMyGamesScope: (myGameIds, pastGameIds) => {
    set(dispatchProjection(get(), { type: 'metaPatch', patch: { kind: 'myGamesScope', myGameIds, pastGameIds } }));
  },

  reset: () => {
    set(initialStoreState());
    syncAppIconBadgeFromStore(0);
  },
}));

function normalizePartialState(partial: Partial<UnreadStoreState>): Partial<UnreadStoreState> {
  if ('byContext' in partial && partial.byContext != null && partial.baseByContext == null) {
    return { ...partial, baseByContext: partial.byContext };
  }
  return partial;
}

const storeSetState = useUnreadStore.setState.bind(useUnreadStore);
useUnreadStore.setState = ((partial, replace) => {
  if (replace === true) {
    storeSetState(partial as UnreadStoreState, true);
    return;
  }
  if (partial === undefined) return;
  storeSetState(normalizePartialState(partial as Partial<UnreadStoreState>));
}) as typeof useUnreadStore.setState;

const storeGetState = useUnreadStore.getState.bind(useUnreadStore);
useUnreadStore.getState = () => {
  const s = storeGetState();
  return { ...s, byContext: s.baseByContext };
};

export type UnreadChatContextType = SnapshotContextType;

export function isUnreadStoreWarm(state: UnreadStoreState = useUnreadStore.getState()): boolean {
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
  return state.displayedByContext[contextKey(contextType, contextId)] ?? 0;
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
  return sumGameContextUnread(state.displayedByContext, gameIds);
}

export function selectMarketBuyerUnread(
  currentUserId: string | undefined,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return marketBuyerSellerUnreadFromContext(state.displayedByContext, state.groupChannelMeta, currentUserId).buyer;
}

export function selectMarketSellerUnread(
  currentUserId: string | undefined,
  state: UnreadStoreState = useUnreadStore.getState()
): number {
  return marketBuyerSellerUnreadFromContext(state.displayedByContext, state.groupChannelMeta, currentUserId).seller;
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
  const displayed = state.displayedByContext ?? state.byContext ?? {};
  if (!warm) return displayed[key] ?? fallback;
  return displayed[key] ?? 0;
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

export type { UnreadStoreState, UnreadTotals };
