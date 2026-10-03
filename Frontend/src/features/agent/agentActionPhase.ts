import type { AgentActionPreviewLine, AgentPendingActionDto } from '@shared/agentContract';

/**
 * Visual phase of a server-executed confirmation card:
 * pending (buttons) → executing (Confirm tapped, request in flight) → done / failed;
 * closed = rejected or expired.
 */
export type AgentActionPhase = 'pending' | 'executing' | 'done' | 'failed' | 'closed';

export function agentActionPhase(
  action: Pick<AgentPendingActionDto, 'status' | 'result'>,
  busy: 'confirm' | 'always' | 'reject' | null,
): AgentActionPhase {
  const { status } = action;
  if (status === 'PENDING') return busy === 'confirm' || busy === 'always' ? 'executing' : 'pending';
  // UNKNOWN: a client-executed action's lease expired with no report.
  if (status === 'FAILED' || status === 'UNKNOWN') return 'failed';
  if (status === 'EXECUTED' || status === 'CONFIRMED') return action.result?.ok === false ? 'failed' : 'done';
  return 'closed';
}

/**
 * Outcome haptic for a phase change seen on screen: only after the user confirmed here
 * (pending / executing → done / failed). A card that arrives settled (auto-approved, reload)
 * stays silent.
 */
export function agentActionOutcomeHaptic(previous: AgentActionPhase | null, next: AgentActionPhase): 'success' | 'error' | null {
  if (previous !== 'pending' && previous !== 'executing') return null;
  if (next === 'done') return 'success';
  if (next === 'failed') return 'error';
  return null;
}

/** change: `from → to`; added: a new or context value; removed: a value that goes away. */
export type AgentPreviewLineKind = 'change' | 'added' | 'removed';

export function agentPreviewLineKind(line: Pick<AgentActionPreviewLine, 'from' | 'to'>): AgentPreviewLineKind {
  if (line.from != null && line.to != null) return 'change';
  return line.to != null ? 'added' : 'removed';
}
