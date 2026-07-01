export type {
  ComputeTotalsMeta,
  ContextKey,
  GroupChannelMeta,
  OptimisticUnreadBump,
  SnapshotApplyOptions,
  SnapshotContextType,
  UnreadAuthorityClock,
  UnreadAuthorityEnvelope,
  UnreadAuthorityReason,
  UnreadMergeState,
  UnreadSnapshot,
  UnreadSnapshotClock,
  UnreadTotals,
} from './types';

export { contextKey, parseContextKey } from './contextKey';
export { computeTotals, emptyUnreadTotals } from './computeTotals';
export {
  computeRepairFloor,
  mergeDeltaAccepted,
  mergeSnapshotAccepted,
  reapplyOptimisticClears,
  setContextUnreadInMap,
  shouldApplyDelta,
  shouldApplySnapshot,
} from './merge';
export {
  applyInboundMessageBump,
  clearOptimisticBumpForContext,
  computeContextCountWithBump,
  noteReconciledInboundMessageIds,
  reconcileOptimisticBumpOnEnvelope,
  type OptimisticBumpMap,
} from './optimisticReceive';
