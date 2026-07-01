import type { ContextKey, SnapshotApplyOptions, UnreadAuthorityClock, UnreadMergeState } from './types';

export function computeRepairFloor(
  lastAppliedSnapshotRevision: number,
  maxSeenUserUnreadRevision: number
): number {
  return Math.max(lastAppliedSnapshotRevision, maxSeenUserUnreadRevision);
}

export function shouldApplySnapshot(
  snapshotRevision: number,
  lastAppliedSnapshotRevision: number,
  maxSeenUserUnreadRevision: number,
  options: SnapshotApplyOptions = {}
): boolean {
  if (snapshotRevision < lastAppliedSnapshotRevision) return false;

  const repairFloor = computeRepairFloor(lastAppliedSnapshotRevision, maxSeenUserUnreadRevision);
  if (snapshotRevision >= repairFloor) return true;

  const repairRequestedAt = options.repairRequestedAtMaxSeen;
  if (repairRequestedAt == null) return false;
  if (snapshotRevision < repairRequestedAt) return false;

  const intervening = options.interveningDeltaUserRevision;
  if (intervening != null && intervening > snapshotRevision) return false;

  return true;
}

export function shouldApplyDelta(
  envelopeContextRevision: number,
  localContextRevision: number | undefined
): boolean {
  return envelopeContextRevision > (localContextRevision ?? 0);
}

export function setContextUnreadInMap(
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

export function mergeDeltaAccepted(
  state: UnreadMergeState,
  contextKeyValue: ContextKey,
  unreadCount: number,
  clock: UnreadAuthorityClock
): UnreadMergeState {
  return {
    lastAppliedSnapshotRevision: state.lastAppliedSnapshotRevision,
    maxSeenUserUnreadRevision: Math.max(state.maxSeenUserUnreadRevision, clock.userUnreadRevision),
    baseByContext: setContextUnreadInMap(state.baseByContext, contextKeyValue, unreadCount),
    contextRevisions: {
      ...state.contextRevisions,
      [contextKeyValue]: clock.userContextUnreadRevision,
    },
  };
}

export function reapplyOptimisticClears(
  byContext: Record<ContextKey, number>,
  markInFlight: ReadonlySet<ContextKey>
): Record<ContextKey, number> {
  if (markInFlight.size === 0) return byContext;
  const out = { ...byContext };
  for (const key of markInFlight) {
    delete out[key];
  }
  return out;
}

export function mergeSnapshotAccepted(
  state: UnreadMergeState,
  snapshot: {
    userUnreadRevision: number;
    byContext: Record<ContextKey, number>;
    contextRevisions?: Record<ContextKey, number>;
  },
  markInFlight: ReadonlySet<ContextKey> = new Set()
): UnreadMergeState {
  const baseByContext = reapplyOptimisticClears(snapshot.byContext, markInFlight);
  return {
    lastAppliedSnapshotRevision: snapshot.userUnreadRevision,
    maxSeenUserUnreadRevision: Math.max(state.maxSeenUserUnreadRevision, snapshot.userUnreadRevision),
    baseByContext,
    contextRevisions: {
      ...state.contextRevisions,
      ...snapshot.contextRevisions,
    },
  };
}
