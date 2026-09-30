/**
 * Propose half of an agent write (see `agentActions.service.ts` for the whole flow).
 * Kept apart so write tools can import it without pulling in the run service.
 */
import { AgentActionStatus, Prisma } from '@prisma/client';
import type { AgentActionPreview, AgentToolRiskTier } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AGENT_ACTION_TTL_MS, type AgentStoredActionArgs } from './agentActionOutcome';
import { agentT } from './i18n/agentI18n';
import type { AgentToolContext, AgentToolResult } from './tools/registry';

export type ProposeAgentActionParams = {
  toolName: string;
  /** Validated model args (audit only). */
  input: unknown;
  /** Server-built payload `confirm.execute` runs. */
  plan: unknown;
  preview: AgentActionPreview;
  /** Current DB state the tool's `escalate` compares against (e.g. the game before `update_game`). */
  currentState?: unknown;
};

/** Tool tier, escalated per call. Unknown tool context (direct handler calls) → critical. */
function effectiveRiskTier(ctx: AgentToolContext, params: ProposeAgentActionParams): AgentToolRiskTier {
  const tool = ctx.tool;
  if (!tool || tool.name !== params.toolName || tool.riskTier !== 'standard') return 'critical';
  return tool.escalate?.(ctx, params.input, params.currentState) === 'critical' ? 'critical' : 'standard';
}

/**
 * Saves the pending action and builds the write tool's result. Throws 409 when the chat
 * already has an unconfirmed action (one change at a time).
 */
export async function proposeAgentAction(
  ctx: AgentToolContext,
  params: ProposeAgentActionParams,
): Promise<AgentToolResult> {
  if (!ctx.runId || !ctx.chatId) {
    throw new Error('write tools need a run and chat context');
  }
  const open = await prisma.agentPendingAction.findFirst({
    where: { chatId: ctx.chatId, status: AgentActionStatus.PENDING, expiresAt: { gt: ctx.now } },
    select: { id: true },
  });
  if (open) {
    throw new ApiError(409, 'Another change is already waiting for the user to confirm; one change at a time.');
  }
  const args: AgentStoredActionArgs = {
    input: params.input,
    plan: params.plan,
    locale: ctx.locale,
    timezone: ctx.timezone,
    riskTier: effectiveRiskTier(ctx, params),
  };
  const action = await prisma.agentPendingAction.create({
    data: {
      runId: ctx.runId,
      chatId: ctx.chatId,
      userId: ctx.principal.userId,
      toolName: params.toolName,
      callId: ctx.callId ?? null,
      args: args as unknown as Prisma.InputJsonValue,
      preview: params.preview as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(ctx.now.getTime() + AGENT_ACTION_TTL_MS),
    },
  });
  return {
    data: {
      status: 'awaiting_user_confirmation',
      actionId: action.id,
      preview: params.preview,
      note: 'Nothing has changed yet. The user sees a confirmation card with this preview and must tap Confirm. Do not say it is done.',
    },
    summary: agentT(ctx.locale, 'summary.awaitingConfirmation'),
    awaitingConfirmation: { actionId: action.id },
  };
}
