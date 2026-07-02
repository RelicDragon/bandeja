/**
 * Unread Projection — Phase 3
 *
 * Pure synchronous reducer for unread state. Single owner of merge rules,
 * optimistic ops, base/display split, and totals. `unreadStore` is a thin adapter.
 *
 * @module
 */

import {
  mergeDeltaAccepted,
  mergeSnapshotAccepted,
  noteReconciledInboundMessageIds,
  setContextUnreadInMap,
  shouldApplyDelta,
  shouldApplySnapshot,
  computeTotals,
} from '@bandeja/unread-contract';
import type { ContextKey, UnreadAuthorityClock, UnreadTotals } from '@bandeja/unread-contract';
import {
  applyScopedGameTotals,
  byContextFromSnapshotDto,
  emptyUnreadTotals,
  hydrateBugMetaFromGroupChannels,
  hydrateGroupChannelMetaFromPayload,
  mergeServerTotals,
  type ComputeTotalsMeta,
  type GroupChannelMeta,
  type SnapshotContextType,
  type SocketContextType,
  type UnreadSnapshotDto,
  parseContextKey,
} from '@/services/chat/unreadSnapshot';
import { sampleUnreadTotalsDrift } from '@/services/chat/unreadDriftMetric';

export type OptimisticUnreadState =
  | { type: 'clear'; previousCount: number; clientOpId: string }
  | { type: 'bump'; pendingCount: number; messageIds: string[] };

export type RefreshRepairMeta = {
  requestedAtMaxSeen: number;
  interveningMaxUserRevision: number | null;
};

export type UnreadProjectionState = {
  version: number;
  fetchedAt: number;
  lastAppliedSnapshotRevision: number;
  maxSeenUserUnreadRevision: number;
  refreshRepairMeta: RefreshRepairMeta | null;
  baseByContext: Record<ContextKey, number>;
  contextRevisions: Record<ContextKey, number>;
  optimistic: Record<ContextKey, OptimisticUnreadState>;
  displayedByContext: Record<ContextKey, number>;
  totals: UnreadTotals;
  groupChannelMeta: Record<string, GroupChannelMeta>;
  mutedGroupIds: Set<string>;
  myGameIds: Set<string>;
  pastGameIds: Set<string>;
  markInFlight: Set<ContextKey>;
  markReadConfirmedKeys: Set<ContextKey>;
  reconciledInboundMessageIds: Set<string>;
  lastEnteredContextKey: ContextKey | null;
};

export type EnterContextParams = {
  contextType: SnapshotContextType;
  contextId: string;
  game?: { id: string; status: string };
  participant?: { status: string; role: string } | null;
  parentParticipant?: { role: string } | null;
  isParentGameAdminOrOwner?: boolean;
  /** Parent-league access without child participant row — unread snapshot omits this game. */
  forceMarkReadNetwork?: boolean;
};

export type AuthorityEnvelopeInput = {
  contextType: SocketContextType;
  contextId: string;
  unreadCount: number;
  contextKey?: ContextKey;
  clock?: UnreadAuthorityClock;
  clientOpId?: string;
};

export type UnreadEvent =
  | { type: 'snapshotReceived'; snapshot: UnreadSnapshotDto }
  | { type: 'authorityEnvelopeReceived'; envelope: AuthorityEnvelopeInput; resolvedKey: ContextKey | null }
  | { type: 'enterContext'; contextKey: ContextKey; clientOpId: string; skipOptimistic?: boolean }
  | { type: 'markReadRequested'; contextKey: ContextKey; clientOpId: string }
  | { type: 'markReadAcked'; envelope: AuthorityEnvelopeInput; resolvedKey: ContextKey }
  | { type: 'markReadFailed'; contextKey: ContextKey }
  | { type: 'inboundMessageSeen'; contextKey: ContextKey; messageId: string; senderId: string }
  | { type: 'userInvalidated'; userUnreadRevision: number; reason: string }
  | { type: 'metaPatch'; patch: MetaPatch }
  | { type: 'logout' };

export type MetaPatch =
  | { kind: 'groupChannelMeta'; channelId: string; patch: GroupChannelMeta }
  | { kind: 'registerBugChannels'; channels: ReadonlyArray<{ id: string; bugId?: string | null; bug?: { id?: string } | null }> }
  | { kind: 'mutedGroupIds'; ids: Iterable<string> }
  | { kind: 'toggleMutedGroupId'; channelId: string; muted: boolean }
  | { kind: 'myGamesScope'; myGameIds: Iterable<string>; pastGameIds: Iterable<string> };

export type UnreadEffect =
  | { type: 'snapshotSideEffects'; dto: UnreadSnapshotDto }
  | { type: 'viewingClearUnread'; contextType: SnapshotContextType; contextId: string }
  | { type: 'syncNativeBadge'; count: number }
  | { type: 'fetchSnapshotRepair' };

export type UnreadProjectionConfig = {
  shouldSuppressDisplay: (contextType: SnapshotContextType, contextId: string) => boolean;
};

export type UnreadProjectionResult = {
  state: UnreadProjectionState;
  effects: UnreadEffect[];
};

export function createInitialUnreadProjectionState(): UnreadProjectionState {
  return {
    version: 0,
    fetchedAt: 0,
    lastAppliedSnapshotRevision: 0,
    maxSeenUserUnreadRevision: 0,
    refreshRepairMeta: null,
    baseByContext: {},
    contextRevisions: {},
    optimistic: {},
    displayedByContext: {},
    totals: emptyUnreadTotals(),
    groupChannelMeta: {},
    mutedGroupIds: new Set(),
    myGameIds: new Set(),
    pastGameIds: new Set(),
    markInFlight: new Set(),
    markReadConfirmedKeys: new Set(),
    reconciledInboundMessageIds: new Set(),
    lastEnteredContextKey: null,
  };
}

function buildComputeMeta(
  state: Pick<UnreadProjectionState, 'groupChannelMeta' | 'mutedGroupIds' | 'myGameIds' | 'pastGameIds'>
): ComputeTotalsMeta {
  return {
    groupChannelMeta: state.groupChannelMeta,
    mutedGroupIds: state.mutedGroupIds,
    myGameIds: state.myGameIds,
    pastGameIds: state.pastGameIds,
  };
}

function toDisplayedByContext(
  baseByContext: Record<ContextKey, number>,
  config: UnreadProjectionConfig
): Record<ContextKey, number> {
  const out: Record<ContextKey, number> = {};
  for (const [rawKey, count] of Object.entries(baseByContext)) {
    if (count <= 0) continue;
    const key = rawKey as ContextKey;
    const parsed = parseContextKey(key);
    if (!parsed) continue;
    const displayed = config.shouldSuppressDisplay(parsed.contextType, parsed.contextId) ? 0 : count;
    if (displayed > 0) out[key] = displayed;
  }
  return out;
}

function recomputeDerived(
  state: UnreadProjectionState,
  effectiveForDisplay: Record<ContextKey, number>,
  config: UnreadProjectionConfig,
  serverTotals?: Partial<UnreadTotals>
): Pick<UnreadProjectionState, 'displayedByContext' | 'totals'> {
  const meta = buildComputeMeta(state);
  const displayedByContext = toDisplayedByContext(effectiveForDisplay, config);
  const computed = applyScopedGameTotals(computeTotals(displayedByContext, meta), displayedByContext, meta);
  return {
    displayedByContext,
    totals: mergeServerTotals(computed, serverTotals),
  };
}

function noteInterveningDeltaDuringRepair(
  state: UnreadProjectionState,
  userUnreadRevision: number
): RefreshRepairMeta | null {
  const repairMeta = state.refreshRepairMeta;
  if (!repairMeta) return null;
  const nextRevision = Math.max(repairMeta.interveningMaxUserRevision ?? 0, userUnreadRevision);
  if (nextRevision === repairMeta.interveningMaxUserRevision) return repairMeta;
  return { ...repairMeta, interveningMaxUserRevision: nextRevision };
}

function applyOptimisticToBase(
  baseByContext: Record<ContextKey, number>,
  optimistic: Record<ContextKey, OptimisticUnreadState>,
  markInFlight: ReadonlySet<ContextKey>
): Record<ContextKey, number> {
  let out = { ...baseByContext };
  for (const [key, op] of Object.entries(optimistic)) {
    if (op.type !== 'bump') continue;
    const contextKeyValue = key as ContextKey;
    const base = out[contextKeyValue] ?? 0;
    out = setContextUnreadInMap(out, contextKeyValue, base + op.pendingCount);
  }
  for (const key of markInFlight) {
    out = setContextUnreadInMap(out, key, 0);
  }
  for (const [key, op] of Object.entries(optimistic)) {
    if (op.type === 'clear') {
      out = setContextUnreadInMap(out, key as ContextKey, 0);
    }
  }
  return out;
}

function withDerived(
  state: UnreadProjectionState,
  baseByContext: Record<ContextKey, number>,
  config: UnreadProjectionConfig,
  serverTotals?: Partial<UnreadTotals>
): UnreadProjectionState {
  const effectiveForDisplay = applyOptimisticToBase(baseByContext, state.optimistic, state.markInFlight);
  return {
    ...state,
    baseByContext,
    ...recomputeDerived(state, effectiveForDisplay, config, serverTotals),
  };
}

function clearOptimisticForKey(
  optimistic: Record<ContextKey, OptimisticUnreadState>,
  key: ContextKey,
  clientOpId?: string
): Record<ContextKey, OptimisticUnreadState> {
  const op = optimistic[key];
  if (!op) return optimistic;
  if (clientOpId && op.type === 'clear' && op.clientOpId !== clientOpId) return optimistic;
  const next = { ...optimistic };
  delete next[key];
  return next;
}

function clearBumpOptimisticForContext(
  optimistic: Record<ContextKey, OptimisticUnreadState>,
  key: ContextKey
): Record<ContextKey, OptimisticUnreadState> {
  const op = optimistic[key];
  if (!op || op.type !== 'bump') return optimistic;
  const next = { ...optimistic };
  delete next[key];
  return next;
}

function stripBumpOptimistics(
  optimistic: Record<ContextKey, OptimisticUnreadState>
): Record<ContextKey, OptimisticUnreadState> {
  const next: Record<ContextKey, OptimisticUnreadState> = {};
  for (const [key, op] of Object.entries(optimistic)) {
    if (op.type === 'clear') next[key as ContextKey] = op;
  }
  return next;
}

function reduceSnapshotReceived(
  state: UnreadProjectionState,
  snapshot: UnreadSnapshotDto,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  const snapshotRevision = snapshot.clock?.userUnreadRevision;

  if (snapshotRevision != null) {
    const accepted = shouldApplySnapshot(
      snapshotRevision,
      state.lastAppliedSnapshotRevision,
      state.maxSeenUserUnreadRevision,
      {
        repairRequestedAtMaxSeen: state.refreshRepairMeta?.requestedAtMaxSeen,
        interveningDeltaUserRevision: state.refreshRepairMeta?.interveningMaxUserRevision,
      }
    );
    if (!accepted) {
      return {
        state: { ...state, refreshRepairMeta: null },
        effects: [],
      };
    }
  }

  const groupChannelMeta = {
    ...state.groupChannelMeta,
    ...hydrateGroupChannelMetaFromPayload(snapshot),
  };
  const snapshotByContext = byContextFromSnapshotDto(snapshot);
  const mutedGroupIds = snapshot.mutedGroupIds ? new Set(snapshot.mutedGroupIds) : state.mutedGroupIds;

  const merged =
    snapshotRevision != null
      ? mergeSnapshotAccepted(
          {
            lastAppliedSnapshotRevision: state.lastAppliedSnapshotRevision,
            maxSeenUserUnreadRevision: state.maxSeenUserUnreadRevision,
            baseByContext: state.baseByContext,
            contextRevisions: state.contextRevisions,
          },
          {
            userUnreadRevision: snapshotRevision,
            byContext: snapshotByContext,
            contextRevisions: snapshot.contextRevisions,
          },
          state.markInFlight
        )
      : {
          lastAppliedSnapshotRevision: state.lastAppliedSnapshotRevision,
          maxSeenUserUnreadRevision: state.maxSeenUserUnreadRevision,
          baseByContext: snapshotByContext,
          contextRevisions: {
            ...state.contextRevisions,
            ...snapshot.contextRevisions,
          },
        };

  const nextBase = merged.baseByContext;
  const optimisticAfterSnapshot = stripBumpOptimistics(state.optimistic);
  const nextState = withDerived(
    {
      ...state,
      version: snapshot.version ?? snapshotRevision ?? Date.now(),
      fetchedAt: Date.now(),
      groupChannelMeta,
      mutedGroupIds,
      contextRevisions: merged.contextRevisions,
      lastAppliedSnapshotRevision: merged.lastAppliedSnapshotRevision,
      maxSeenUserUnreadRevision: merged.maxSeenUserUnreadRevision,
      refreshRepairMeta: null,
      optimistic: optimisticAfterSnapshot,
    },
    nextBase,
    config,
    snapshot.totals
  );

  sampleUnreadTotalsDrift(nextState.totals.all, snapshot.totals?.all);

  const dtoWithContext: UnreadSnapshotDto = {
    ...snapshot,
    byContext: nextState.baseByContext,
    totals: nextState.totals,
    version: nextState.version,
  };

  return {
    state: nextState,
    effects: [
      { type: 'snapshotSideEffects', dto: dtoWithContext },
      { type: 'syncNativeBadge', count: nextState.totals.all },
    ],
  };
}

function reduceAuthorityEnvelope(
  state: UnreadProjectionState,
  envelope: AuthorityEnvelopeInput,
  resolvedKey: ContextKey | null,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  const effects: UnreadEffect[] = [];

  if (!resolvedKey) {
    return { state, effects: [] };
  }

  const revisionKey = envelope.contextKey ?? resolvedKey;
  if (
    envelope.clock &&
    !shouldApplyDelta(envelope.clock.userContextUnreadRevision, state.contextRevisions[revisionKey])
  ) {
    return { state, effects: [] };
  }

  let optimistic = state.optimistic;
  let markReadConfirmedKeys = state.markReadConfirmedKeys;
  let markInFlight = state.markInFlight;
  let reconciledInboundMessageIds = state.reconciledInboundMessageIds;

  if (envelope.unreadCount > 0) {
    markReadConfirmedKeys = new Set(state.markReadConfirmedKeys);
    markReadConfirmedKeys.delete(resolvedKey);
    if (!envelope.clock) {
      markInFlight = new Set(state.markInFlight);
      markInFlight.delete(resolvedKey);
      optimistic = clearOptimisticForKey(optimistic, resolvedKey);
    }
  }

  const bumpBefore = optimistic[resolvedKey];
  if (bumpBefore?.type === 'bump') {
    reconciledInboundMessageIds = noteReconciledInboundMessageIds(
      state.reconciledInboundMessageIds,
      bumpBefore.messageIds
    );
    optimistic = clearBumpOptimisticForContext(optimistic, resolvedKey);
  }

  if (envelope.clientOpId) {
    optimistic = clearOptimisticForKey(optimistic, resolvedKey, envelope.clientOpId);
    markReadConfirmedKeys = new Set(markReadConfirmedKeys);
    markReadConfirmedKeys.add(resolvedKey);
  }

  let nextMerge = {
    lastAppliedSnapshotRevision: state.lastAppliedSnapshotRevision,
    maxSeenUserUnreadRevision: state.maxSeenUserUnreadRevision,
    baseByContext: state.baseByContext,
    contextRevisions: state.contextRevisions,
  };

  if (envelope.clock) {
    nextMerge = mergeDeltaAccepted(nextMerge, revisionKey, envelope.unreadCount, envelope.clock);
  } else {
    nextMerge = {
      ...nextMerge,
      baseByContext: setContextUnreadInMap(state.baseByContext, revisionKey, envelope.unreadCount),
    };
  }

  const repairMeta =
    envelope.clock != null
      ? noteInterveningDeltaDuringRepair(state, envelope.clock.userUnreadRevision)
      : state.refreshRepairMeta;

  const nextState = withDerived(
    {
      ...state,
      contextRevisions: nextMerge.contextRevisions,
      maxSeenUserUnreadRevision: nextMerge.maxSeenUserUnreadRevision,
      refreshRepairMeta: repairMeta,
      optimistic,
      markReadConfirmedKeys,
      markInFlight,
      reconciledInboundMessageIds,
    },
    nextMerge.baseByContext,
    config
  );

  effects.push({ type: 'syncNativeBadge', count: nextState.totals.all });
  return { state: nextState, effects };
}

function reduceMarkReadRequested(
  state: UnreadProjectionState,
  contextKeyValue: ContextKey,
  clientOpId: string,
  config: UnreadProjectionConfig,
  options?: { skipOptimistic?: boolean }
): UnreadProjectionResult {
  const effects: UnreadEffect[] = [];
  const prev = state.baseByContext[contextKeyValue] ?? 0;
  const markInFlight = new Set(state.markInFlight);
  markInFlight.add(contextKeyValue);

  const markReadConfirmedKeys = new Set(state.markReadConfirmedKeys);
  markReadConfirmedKeys.delete(contextKeyValue);

  const optimistic = { ...state.optimistic };
  if (!options?.skipOptimistic && prev > 0) {
    optimistic[contextKeyValue] = { type: 'clear', previousCount: prev, clientOpId };
    const parsed = parseContextKey(contextKeyValue);
    if (parsed) {
      effects.push({
        type: 'viewingClearUnread',
        contextType: parsed.contextType,
        contextId: parsed.contextId,
      });
    }
  } else if (!optimistic[contextKeyValue]) {
    optimistic[contextKeyValue] = { type: 'clear', previousCount: prev, clientOpId };
  }

  const nextState = withDerived(
    {
      ...state,
      markInFlight,
      markReadConfirmedKeys,
      optimistic,
      lastEnteredContextKey: contextKeyValue,
    },
    state.baseByContext,
    config
  );

  effects.push({ type: 'syncNativeBadge', count: nextState.totals.all });
  return { state: nextState, effects };
}

function reduceMarkReadFailed(
  state: UnreadProjectionState,
  contextKeyValue: ContextKey,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  const optimisticMap = state.optimistic ?? {};
  const op = optimisticMap[contextKeyValue];
  const prev = op?.type === 'clear' ? op.previousCount : 0;
  const optimistic = { ...optimisticMap };
  delete optimistic[contextKeyValue];

  const markInFlight = new Set(state.markInFlight);
  markInFlight.delete(contextKeyValue);

  const nextBase = setContextUnreadInMap(state.baseByContext, contextKeyValue, prev);
  const nextState = withDerived(
    {
      ...state,
      optimistic,
      markInFlight,
      lastEnteredContextKey: null,
    },
    nextBase,
    config
  );

  return {
    state: nextState,
    effects: [
      { type: 'syncNativeBadge', count: nextState.totals.all },
      { type: 'fetchSnapshotRepair' },
    ],
  };
}

function reduceMetaPatch(
  state: UnreadProjectionState,
  patch: MetaPatch,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  let next = { ...state };

  switch (patch.kind) {
    case 'groupChannelMeta': {
      const groupChannelMeta = {
        ...state.groupChannelMeta,
        [patch.channelId]: { ...state.groupChannelMeta[patch.channelId], ...patch.patch },
      };
      next = { ...next, groupChannelMeta };
      break;
    }
    case 'registerBugChannels': {
      if (patch.channels.length === 0) return { state, effects: [] };
      const hydrated = hydrateBugMetaFromGroupChannels(patch.channels);
      const groupChannelMeta = { ...state.groupChannelMeta, ...hydrated };
      next = { ...next, groupChannelMeta };
      break;
    }
    case 'mutedGroupIds':
      next = { ...next, mutedGroupIds: new Set(patch.ids) };
      break;
    case 'toggleMutedGroupId': {
      const mutedGroupIds = new Set(state.mutedGroupIds);
      if (patch.muted) mutedGroupIds.add(patch.channelId);
      else mutedGroupIds.delete(patch.channelId);
      next = { ...next, mutedGroupIds };
      break;
    }
    case 'myGamesScope':
      next = {
        ...next,
        myGameIds: new Set(patch.myGameIds),
        pastGameIds: new Set(patch.pastGameIds),
      };
      break;
    default: {
      const _exhaustive: never = patch;
      return _exhaustive;
    }
  }

  const nextState = withDerived(next, state.baseByContext, config);
  return {
    state: nextState,
    effects: [{ type: 'syncNativeBadge', count: nextState.totals.all }],
  };
}

function reduceInboundMessageSeen(
  state: UnreadProjectionState,
  contextKeyValue: ContextKey,
  messageId: string,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  if (state.markInFlight.has(contextKeyValue)) {
    return { state, effects: [] };
  }
  if (state.reconciledInboundMessageIds.has(messageId)) {
    return { state, effects: [] };
  }

  const parsed = parseContextKey(contextKeyValue);
  if (parsed && config.shouldSuppressDisplay(parsed.contextType, parsed.contextId)) {
    return { state, effects: [] };
  }

  const existing = state.optimistic[contextKeyValue];
  if (existing?.type === 'bump' && existing.messageIds.includes(messageId)) {
    return { state, effects: [] };
  }

  const optimistic = { ...state.optimistic };
  if (existing?.type === 'bump') {
    optimistic[contextKeyValue] = {
      type: 'bump',
      pendingCount: existing.pendingCount + 1,
      messageIds: [...existing.messageIds, messageId],
    };
  } else {
    optimistic[contextKeyValue] = {
      type: 'bump',
      pendingCount: 1,
      messageIds: [messageId],
    };
  }

  const nextState = withDerived({ ...state, optimistic }, state.baseByContext, config);
  return {
    state: nextState,
    effects: [{ type: 'syncNativeBadge', count: nextState.totals.all }],
  };
}

function reduceUserInvalidated(
  state: UnreadProjectionState,
  userUnreadRevision: number
): UnreadProjectionResult {
  if (userUnreadRevision <= state.lastAppliedSnapshotRevision) {
    return { state, effects: [] };
  }
  return {
    state: {
      ...state,
      maxSeenUserUnreadRevision: Math.max(state.maxSeenUserUnreadRevision, userUnreadRevision),
    },
    effects: [{ type: 'fetchSnapshotRepair' }],
  };
}

export function reduceUnreadProjection(
  state: UnreadProjectionState,
  event: UnreadEvent,
  config: UnreadProjectionConfig
): UnreadProjectionResult {
  switch (event.type) {
    case 'snapshotReceived':
      return reduceSnapshotReceived(state, event.snapshot, config);
    case 'authorityEnvelopeReceived':
      return reduceAuthorityEnvelope(state, event.envelope, event.resolvedKey, config);
    case 'enterContext':
    case 'markReadRequested':
      return reduceMarkReadRequested(state, event.contextKey, event.clientOpId, config, {
        skipOptimistic: event.type === 'enterContext' ? event.skipOptimistic : false,
      });
    case 'markReadAcked':
      return reduceAuthorityEnvelope(state, event.envelope, event.resolvedKey, config);
    case 'markReadFailed':
      return reduceMarkReadFailed(state, event.contextKey, config);
    case 'inboundMessageSeen':
      return reduceInboundMessageSeen(state, event.contextKey, event.messageId, config);
    case 'userInvalidated':
      return reduceUserInvalidated(state, event.userUnreadRevision);
    case 'metaPatch':
      return reduceMetaPatch(state, event.patch, config);
    case 'logout':
      return { state: createInitialUnreadProjectionState(), effects: [] };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/** Store adapter: map projection state to legacy `byContext` field name. */
export function projectionBaseByContext(state: UnreadProjectionState): Record<ContextKey, number> {
  return state.baseByContext;
}

export function projectionDisplayedByContext(state: UnreadProjectionState): Record<ContextKey, number> {
  return state.displayedByContext;
}

export function shouldSkipMarkReadNetwork(state: UnreadProjectionState, key: ContextKey): boolean {
  if ((state.baseByContext[key] ?? 0) > 0) return false;
  if (state.optimistic[key]?.type === 'clear') return false;
  return state.markReadConfirmedKeys.has(key);
}

export function shouldSkipEnterOptimistic(state: UnreadProjectionState, key: ContextKey): boolean {
  if (state.lastEnteredContextKey !== key) return false;
  const parsed = parseContextKey(key);
  if (!parsed) return false;
  return (state.baseByContext[key] ?? 0) === 0 && !state.optimistic[key];
}

export function getOptimisticRestoreCount(state: UnreadProjectionState, key: ContextKey): number {
  const op = state.optimistic?.[key];
  return op?.type === 'clear' ? op.previousCount : 0;
}

export function getPendingClientOpId(state: UnreadProjectionState, key: ContextKey): string | undefined {
  const op = state.optimistic?.[key];
  return op?.type === 'clear' ? op.clientOpId : undefined;
}

export function clearMarkInFlight(state: UnreadProjectionState, key: ContextKey): UnreadProjectionState {
  const markInFlight = new Set(state.markInFlight);
  markInFlight.delete(key);
  return { ...state, markInFlight };
}

export function beginRefreshRepair(state: UnreadProjectionState): UnreadProjectionState {
  return {
    ...state,
    refreshRepairMeta: {
      requestedAtMaxSeen: state.maxSeenUserUnreadRevision,
      interveningMaxUserRevision: null,
    },
  };
}

export function endRefreshRepair(state: UnreadProjectionState): UnreadProjectionState {
  return { ...state, refreshRepairMeta: null };
}
