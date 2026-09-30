import type { AgentPendingActionDto } from '@shared/agentContract';

export interface AgentActionButtons {
  reject: boolean;
  allowOnce: boolean;
  alwaysAllow: boolean;
  /** Critical tool / escalated call: no "Always allow", a small "always asks" hint instead. */
  alwaysAsksHint: boolean;
}

const NONE: AgentActionButtons = { reject: false, allowOnce: false, alwaysAllow: false, alwaysAsksHint: false };

/**
 * Which buttons a confirmation card shows (plan §15). Only PENDING actions have buttons; an
 * auto-approved action is already settled. Client-executed actions (booking) keep Reject /
 * Allow once: their tier is critical, and "Always allow" is never offered for them.
 */
export function agentActionButtons(
  action: Pick<AgentPendingActionDto, 'status' | 'autoApproved' | 'canAlwaysAllow' | 'execution'>,
): AgentActionButtons {
  if (action.status !== 'PENDING' || action.autoApproved) return NONE;
  const alwaysAllow = action.canAlwaysAllow === true && action.execution !== 'client';
  return { reject: true, allowOnce: true, alwaysAllow, alwaysAsksHint: !alwaysAllow };
}

/** Plan kind of a client-executed tool (the plan itself only arrives with the claim). */
export function agentClientOperationForTool(toolName: string): 'book' | 'cancel' {
  return toolName.startsWith('cancel_') ? 'cancel' : 'book';
}

/**
 * i18n key of the primary client-run button. Composite tools name both halves: the app books and
 * then creates the game (`create_game_with_booking`), or cancels the bookings and then the game
 * (a client-executed `cancel_game` always carries bookings; without them it runs on the server).
 */
export function agentClientRunLabelKey(toolName: string): string {
  if (toolName === 'create_game_with_booking') return 'agent.clientExec.bookAndCreateGameInApp';
  if (toolName === 'cancel_game') return 'agent.clientExec.cancelBookingsAndGameInApp';
  return agentClientOperationForTool(toolName) === 'cancel' ? 'agent.clientExec.cancelInApp' : 'agent.clientExec.bookInApp';
}

/** i18n key of the final "saving" progress step (the post-step after the club writes). */
export function agentClientSavingLabelKey(toolName: string): string {
  if (toolName === 'create_game_with_booking') return 'agent.clientExec.savingCreateGame';
  if (toolName === 'cancel_game') return 'agent.clientExec.savingCancelGame';
  return 'agent.clientExec.saving';
}

export interface AgentClientActionButtons {
  reject: boolean;
  /** Primary "Book in app" / "Cancel in app"; null = hidden. */
  run: 'book' | 'cancel' | null;
  /** The primary button reads "Try again" (same device re-claims the same attempt). */
  retry: boolean;
  /** Never offered for client-executed actions (always critical). */
  alwaysAllow: false;
}

/**
 * Client-executed card (booking plan §14.5): Reject + "Book / Cancel in app" while PENDING and
 * nothing runs on this device. After a local error or an unsent report, "Try again" (a CONFIRMED
 * action included: the same device gets the same attempt, finished calls are only re-reported).
 */
export function agentClientActionButtons(
  action: Pick<AgentPendingActionDto, 'status' | 'toolName'>,
  localStage: string | null,
): AgentClientActionButtons {
  const run = agentClientOperationForTool(action.toolName);
  const retryable = localStage === 'error' || localStage === 'report_pending';
  if (action.status === 'PENDING' && (localStage == null || localStage === 'error')) {
    return { reject: true, run, retry: localStage === 'error', alwaysAllow: false };
  }
  if (action.status === 'CONFIRMED' && retryable) return { reject: false, run, retry: true, alwaysAllow: false };
  return { reject: false, run: null, retry: false, alwaysAllow: false };
}
