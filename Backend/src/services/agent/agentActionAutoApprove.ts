/**
 * Auto-approve (plan §15): a write the user always allows runs without a tap, inside the
 * run that proposed it.
 *
 * Called by the run loop right after a write tool created its PENDING action. Applies only
 * when ALL hold:
 *   - the call's effective tier (`args.riskTier`, tool tier after `escalate`) is `standard`
 *     and the registered tool is still `standard`;
 *   - the user stored ALWAYS_ALLOW for the tool (`AgentToolPermission`);
 *   - the run is not tainted: no read tool declaring `untrustedContent` (game chat, later
 *     web search) returned content earlier in this run. A tainted run ignores ALWAYS_ALLOW
 *     and shows the normal confirmation card, so text from other people can never trigger
 *     a change without a tap.
 * Then the same confirm path as a tap runs: PENDING → CONFIRMED (`autoApproved=true`, by a
 * conditional `updateMany`) → principal re-loaded → `confirm.authorize` → `confirm.execute`
 * → EXECUTED / FAILED with `result` (`agentActionExecute.ts`). Lost rights → FAILED,
 * nothing changes. The run loop reports the outcome to the model as this call's tool
 * result (no outcome message, no follow-up run) and emits `action.pending` with the settled
 * action (`autoApproved: true`) for the "executed automatically" card.
 */
import { AgentActionStatus, type AgentPendingAction } from '@prisma/client';
import prisma from '../../config/database';
import { executeAgentAction } from './agentActionExecute';
import { closeAgentAction, readStoredActionArgs, type AgentActionClosing } from './agentActionOutcome';
import { getAgentToolPermissionMode } from './agentToolPermission.service';
import { isClientExecutedPlan } from './clientExecution/clientPlan';
import { agentLang } from './i18n/agentI18n';
import type { AgentToolRegistry } from './tools/registry';

export type AgentAutoApproveResult = { action: AgentPendingAction; closing: AgentActionClosing };

export type AgentAutoApproveOptions = {
  /** A read tool with `untrustedContent: true` returned content earlier in this run. */
  runTainted?: boolean;
};

/** Returns null when the action must wait for a tap (the normal PENDING card). */
export async function autoApproveAgentAction(
  registry: AgentToolRegistry,
  actionId: string,
  now: Date,
  options: AgentAutoApproveOptions = {},
): Promise<AgentAutoApproveResult | null> {
  if (options.runTainted) return null;
  const action = await prisma.agentPendingAction.findUnique({ where: { id: actionId } });
  if (!action || action.status !== AgentActionStatus.PENDING) return null;
  const stored = readStoredActionArgs(action.args);
  if (stored.riskTier !== 'standard') return null;
  // Client-executed actions need the device (claim → provider → report): always ask.
  if (isClientExecutedPlan(stored.plan)) return null;
  const tool = registry.get(action.toolName);
  if (!tool || tool.kind !== 'write' || tool.riskTier !== 'standard') return null;
  if ((await getAgentToolPermissionMode(action.userId, action.toolName, registry)) !== 'ALWAYS_ALLOW') return null;

  const claimed = await prisma.agentPendingAction.updateMany({
    where: { id: action.id, status: AgentActionStatus.PENDING },
    data: { status: AgentActionStatus.CONFIRMED, autoApproved: true },
  });
  if (claimed.count !== 1) return null;

  const locale = agentLang(stored.locale);
  const closing = await executeAgentAction(registry, action, stored, locale, now, { autoApproved: true });
  await prisma.$transaction((tx) =>
    closeAgentAction(tx, action, [AgentActionStatus.CONFIRMED], closing, { outcomeMessage: false }),
  );
  const settled = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: action.id } });
  return { action: settled, closing };
}
