import type { ContextKey, OptimisticUnreadBump } from './types';

export type OptimisticBumpMap = Record<ContextKey, OptimisticUnreadBump>;

export function applyInboundMessageBump(
  bumps: OptimisticBumpMap,
  contextKeyValue: ContextKey,
  messageId: string
): OptimisticBumpMap {
  const existing = bumps[contextKeyValue];
  if (existing?.messageIds.includes(messageId)) return bumps;

  const messageIds = existing ? [...existing.messageIds, messageId] : [messageId];
  return {
    ...bumps,
    [contextKeyValue]: {
      pendingCount: (existing?.pendingCount ?? 0) + 1,
      messageIds,
    },
  };
}

export function clearOptimisticBumpForContext(
  bumps: OptimisticBumpMap,
  contextKeyValue: ContextKey
): OptimisticBumpMap {
  if (!bumps[contextKeyValue]) return bumps;
  const out = { ...bumps };
  delete out[contextKeyValue];
  return out;
}

export function reconcileOptimisticBumpOnEnvelope(
  bumps: OptimisticBumpMap,
  contextKeyValue: ContextKey
): OptimisticBumpMap {
  return clearOptimisticBumpForContext(bumps, contextKeyValue);
}

export function computeContextCountWithBump(
  baseCount: number,
  bump: OptimisticUnreadBump | undefined
): number {
  return baseCount + (bump?.pendingCount ?? 0);
}

export function noteReconciledInboundMessageIds(
  handled: ReadonlySet<string>,
  messageIds: readonly string[],
  maxSize = 500
): Set<string> {
  if (messageIds.length === 0) return new Set(handled);
  const next = new Set(handled);
  for (const id of messageIds) next.add(id);
  if (next.size <= maxSize) return next;
  const trimmed = [...next];
  return new Set(trimmed.slice(trimmed.length - maxSize));
}
