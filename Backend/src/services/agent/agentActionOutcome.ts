/**
 * Closing an `AgentPendingAction` (docs/domains/agent.md "Writes"): every terminal
 * transition (executed, failed, rejected, expired, superseded) is a conditional
 * `updateMany` from the expected status, so a double tap or a race closes it once.
 * The winner appends a TOOL message with a `tool_result` block for the original tool
 * call id (the UI chip shows the outcome) plus the raw model `tool` reply under the same
 * id (`sanitizeToolPairs` keeps the latest reply per call id, so the model sees the
 * outcome instead of "awaiting confirmation"), then completes the paused run once it has
 * no PENDING action left.
 *
 * No dependency on the run service: `agentRun.service.ts` uses the supersede/expire
 * helpers, `agentActions.service.ts` the rest.
 */
import {
  AgentActionStatus,
  AgentMessageRole,
  AgentRunStatus,
  Prisma,
  type AgentMessage,
  type AgentPendingAction,
} from '@prisma/client';
import type { AgentActionResult, AgentContentBlock, AgentToolRiskTier } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { appendAgentMessage } from './agentChat.service';
import { agentT } from './i18n/agentI18n';
import type { AgentLlmMessage } from './llm/deepseekStream';

/** Pending actions expire 15 minutes after the proposal. */
export const AGENT_ACTION_TTL_MS = 15 * 60 * 1000;

type Db = Prisma.TransactionClient | typeof prisma;

/** What a write handler stores in `AgentPendingAction.args`. */
export type AgentStoredActionArgs = {
  /** The validated tool arguments the model sent (audit). */
  input: unknown;
  /** Server-built execution payload; the only thing `confirm.execute` reads. */
  plan: unknown;
  /** Card / result language and the timezone the preview was rendered in. */
  locale: string;
  timezone: string;
  /**
   * Effective risk tier of this call (tool tier, escalated per call). Rows without it
   * read as `critical`: never auto-approved, no "Always allow".
   */
  riskTier: AgentToolRiskTier;
};

export function readStoredActionArgs(args: Prisma.JsonValue): AgentStoredActionArgs {
  const value = (args && typeof args === 'object' && !Array.isArray(args) ? args : {}) as Record<string, unknown>;
  return {
    input: value.input ?? null,
    plan: value.plan ?? null,
    locale: typeof value.locale === 'string' ? value.locale : 'en',
    timezone: typeof value.timezone === 'string' ? value.timezone : 'UTC',
    riskTier: value.riskTier === 'standard' ? 'standard' : 'critical',
  };
}

export type AgentActionModelStatus = 'executed' | 'failed' | 'declined_by_user' | 'expired' | 'superseded' | 'unknown';

export type AgentActionClosing = {
  /** UNKNOWN: a client-executed action's lease ran out with no report (`clientExecution/`). */
  status: 'EXECUTED' | 'FAILED' | 'REJECTED' | 'EXPIRED' | 'UNKNOWN';
  result: AgentActionResult;
  modelStatus: AgentActionModelStatus;
  /** English note for the model. Server-written; never user-written text. */
  modelNote: string;
  modelData?: Record<string, unknown>;
  /** Internal failure detail (admin audit only). */
  error?: string | null;
  executedAt?: Date | null;
};

function outcomeCallId(action: Pick<AgentPendingAction, 'id' | 'callId'>): string {
  return action.callId ?? `action_${action.id}`;
}

async function appendOutcomeMessage(
  db: Db,
  action: AgentPendingAction,
  closing: AgentActionClosing,
): Promise<AgentMessage> {
  const ok = closing.status === 'EXECUTED';
  const block: AgentContentBlock = {
    type: 'tool_result',
    callId: outcomeCallId(action),
    ok,
    summary: closing.result.message ?? '',
    ...(closing.result.entities?.length ? { entities: closing.result.entities } : {}),
  };
  const llmMessages: AgentLlmMessage[] | null = action.callId
    ? [
        {
          role: 'tool',
          tool_call_id: action.callId,
          content: JSON.stringify({
            ok,
            data: {
              status: closing.modelStatus,
              actionId: action.id,
              tool: action.toolName,
              note: closing.modelNote,
              ...(closing.modelData ?? {}),
            },
          }),
        },
      ]
    : null;
  return appendAgentMessage(
    { chatId: action.chatId, role: AgentMessageRole.TOOL, blocks: [block], llmMessages, runId: action.runId },
    db,
  );
}

/** A paused run with no PENDING action left is done. */
export async function completeAwaitingRunIfDone(db: Db, runId: string): Promise<void> {
  const pending = await db.agentPendingAction.count({ where: { runId, status: AgentActionStatus.PENDING } });
  if (pending > 0) return;
  await db.agentRun.updateMany({
    where: { id: runId, status: AgentRunStatus.AWAITING_CONFIRMATION },
    data: { status: AgentRunStatus.COMPLETED },
  });
}

/**
 * `from` → `closing.status`, then the outcome message and run completion. Returns the
 * saved message, or null when another caller already moved the action out of `from`.
 */
export async function closeAgentAction(
  db: Db,
  action: AgentPendingAction,
  from: AgentActionStatus[],
  closing: AgentActionClosing,
  options: { outcomeMessage?: boolean } = {},
): Promise<AgentMessage | null> {
  const updated = await db.agentPendingAction.updateMany({
    where: { id: action.id, status: { in: from } },
    data: {
      status: closing.status,
      result: closing.result as unknown as Prisma.InputJsonValue,
      error: closing.error ?? null,
      ...(closing.executedAt ? { executedAt: closing.executedAt } : {}),
    },
  });
  if (updated.count !== 1) return null;
  // Auto-approved inside a run: the run loop itself saves the tool result for the call.
  if (options.outcomeMessage === false) return null;
  const message = await appendOutcomeMessage(db, action, closing);
  await completeAwaitingRunIfDone(db, action.runId);
  return message;
}

export function expiredClosing(locale: string): AgentActionClosing {
  return {
    status: 'EXPIRED',
    result: { ok: false, message: agentT(locale, 'result.expired') },
    modelStatus: 'expired',
    modelNote:
      'The user did not confirm within 15 minutes, so this change was NOT made. Propose it again only if the user still wants it.',
  };
}

export function supersededClosing(locale: string): AgentActionClosing {
  return {
    status: 'EXPIRED',
    result: { ok: false, message: agentT(locale, 'result.superseded') },
    modelStatus: 'superseded',
    modelNote:
      'The user sent a new message instead of confirming, so this change was NOT made and is cancelled. Propose it again only if the user still wants it.',
  };
}

export function rejectedClosing(locale: string): AgentActionClosing {
  return {
    status: 'REJECTED',
    result: { ok: false, message: agentT(locale, 'result.declined') },
    modelStatus: 'declined_by_user',
    modelNote: 'The user tapped Cancel on the confirmation card. Nothing was changed. Do not retry unless asked.',
  };
}

/**
 * Lazy + sweep expiry: PENDING actions past `expiresAt` → EXPIRED (with the history
 * note). Scoped by user and/or chat when given; bounded per call.
 */
export async function expireStaleAgentActions(
  scope: { userId?: string; chatId?: string; actionId?: string },
  now: Date,
): Promise<number> {
  const stale = await prisma.agentPendingAction.findMany({
    where: {
      status: AgentActionStatus.PENDING,
      expiresAt: { lte: now },
      ...(scope.userId ? { userId: scope.userId } : {}),
      ...(scope.chatId ? { chatId: scope.chatId } : {}),
      ...(scope.actionId ? { id: scope.actionId } : {}),
    },
    orderBy: { expiresAt: 'asc' },
    take: 100,
  });
  let closed = 0;
  for (const action of stale) {
    const { locale } = readStoredActionArgs(action.args);
    const message = await prisma.$transaction((tx) =>
      closeAgentAction(tx, action, [AgentActionStatus.PENDING], expiredClosing(locale)),
    );
    if (message) closed += 1;
  }
  return closed;
}

/** A new user message supersedes every PENDING action of the chat (inside the enqueue tx). */
export async function supersedePendingAgentActions(tx: Prisma.TransactionClient, chatId: string): Promise<void> {
  const pending = await tx.agentPendingAction.findMany({
    where: { chatId, status: AgentActionStatus.PENDING },
    orderBy: { createdAt: 'asc' },
  });
  for (const action of pending) {
    const { locale } = readStoredActionArgs(action.args);
    await closeAgentAction(tx, action, [AgentActionStatus.PENDING], supersededClosing(locale));
  }
}
