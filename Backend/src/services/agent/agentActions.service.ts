/**
 * Pending actions: the confirmation step of every agent write (docs/domains/agent.md
 * "Writes and confirmation", plan §6).
 *
 * Propose (inside a run, from a write tool handler): the handler has validated the args,
 * run the guard and built a preview from DB state; `proposeAgentAction` saves an
 * `AgentPendingAction { args: { input, plan, locale, timezone }, preview, callId }`
 * (expires in 15 min) and returns the tool result with `awaitingConfirmation`, which ends
 * the run AWAITING_CONFIRMATION. One PENDING action per chat at a time.
 *
 * Confirm (`POST /agent/actions/:id/confirm`, owner only, foreign ids 404):
 *   PENDING and not expired → CONFIRMED by a conditional `updateMany` (a double tap loses
 *   the race and just gets the current state back; nothing runs twice) → principal
 *   re-loaded from the DB → the tool's `confirm.authorize` (same guard as at propose) →
 *   `confirm.execute` (same service the HTTP route calls) → EXECUTED / FAILED with
 *   `result` + outcome TOOL message → a short follow-up run is ENQUEUED (QUEUED, never
 *   inline) so the model reports back. Returns `{ action, runId }`.
 *   `{ remember: 'always' }` also stores ALWAYS_ALLOW for the tool once EXECUTED
 *   (`remembered: true`); on a critical tool / escalated call → 400 PERMISSION_NOT_ALLOWED
 *   before anything runs. Auto-approved actions (plan §15) take the same execute path from
 *   the run loop (`agentActionAutoApprove.ts`).
 * Reject: PENDING → REJECTED + "declined" outcome in history; no follow-up run (the card
 *   already says "Cancelled"; a model reply would only cost tokens). `{ action, runId: null }`.
 * Expiry: lazily here and on chat reads, and in the queue sweep (`agentActionOutcome.ts`).
 */
import { AgentActionStatus, type AgentPendingAction } from '@prisma/client';
import type { AgentPendingActionDto } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { loadAgentPrincipal, type AgentPrincipal } from './access/agentPrincipal';
import {
  closeAgentAction,
  expireStaleAgentActions,
  readStoredActionArgs,
  rejectedClosing,
} from './agentActionOutcome';
export { proposeAgentAction, type ProposeAgentActionParams } from './agentActionPropose';
import { toAgentPendingActionDto } from './agentChat.service';
import { getAgentRunService, type AgentRunService } from './agentRun.service';
import { agentLang, agentT } from './i18n/agentI18n';
import { executeAgentAction } from './agentActionExecute';
import { AgentToolPermissionService, getAgentToolPermissionService } from './agentToolPermission.service';
import { getAgentToolRegistry } from './tools';
import { agentApiError } from './agentGuards';
import { isClientExecutedPlan } from './clientExecution/clientPlan';
import type { AgentToolRegistry } from './tools/registry';

export { describeAgentActionFailure } from './agentActionExecute';

/** `POST /agent/actions/:id/confirm` body option: also store ALWAYS_ALLOW for the tool on success. */
export type AgentConfirmRemember = 'always';

export type AgentActionServiceDeps = {
  registry: () => AgentToolRegistry;
  permissions: () => Pick<AgentToolPermissionService, 'assertCanAlwaysAllow' | 'set'>;
  runService: () => Pick<AgentRunService, 'enqueueFollowUpRun'>;
  now: () => Date;
};

export class AgentActionService {
  constructor(private readonly deps: AgentActionServiceDeps) {}

  private async loadOwned(userId: string, actionId: string): Promise<AgentPendingAction> {
    const action = await prisma.agentPendingAction.findFirst({ where: { id: actionId, userId } });
    if (!action) throw new ApiError(404, 'Action not found');
    return action;
  }

  private async dto(actionId: string): Promise<AgentPendingActionDto> {
    return toAgentPendingActionDto(await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: actionId } }));
  }

  /** Non-PENDING state on confirm/reject: idempotent answer or 409. */
  private settled(action: AgentPendingAction, locale: string, idempotent: AgentActionStatus[]): AgentPendingActionDto {
    if (idempotent.includes(action.status)) return toAgentPendingActionDto(action);
    if (action.status === AgentActionStatus.EXPIRED) {
      throw new ApiError(409, agentT(locale, 'action.expired'), true, { code: 'ACTION_EXPIRED' });
    }
    throw new ApiError(409, agentT(locale, 'action.handled'), true, { code: 'ACTION_HANDLED' });
  }

  /** Returns the action if it is still PENDING after lazy expiry; else answers `settled`. */
  private async pendingOrSettled(
    userId: string,
    actionId: string,
    locale: string,
    idempotent: AgentActionStatus[],
  ): Promise<{ action: AgentPendingAction } | { settled: AgentPendingActionDto }> {
    let action = await this.loadOwned(userId, actionId);
    if (action.status === AgentActionStatus.PENDING && action.expiresAt <= this.deps.now()) {
      await expireStaleAgentActions({ actionId: action.id }, this.deps.now());
      action = await this.loadOwned(userId, actionId);
    }
    if (action.status !== AgentActionStatus.PENDING) return { settled: this.settled(action, locale, idempotent) };
    return { action };
  }

  async confirm(
    userId: string,
    actionId: string,
    headerLocale?: string | null,
    options: { remember?: AgentConfirmRemember | null } = {},
  ): Promise<{ action: AgentPendingActionDto; runId: string | null; remembered: boolean }> {
    const first = await this.loadOwned(userId, actionId);
    const stored = readStoredActionArgs(first.args);
    const locale = agentLang(headerLocale || stored.locale);
    if (isClientExecutedPlan(stored.plan)) {
      // Only the app can run it (claim → provider → report); Telegram / old builds hand off.
      throw agentApiError(409, 'CLIENT_EXECUTION_REQUIRED', 'Open the app to confirm this change');
    }
    const remember = options.remember === 'always';
    if (remember) {
      // Checked before anything runs: a critical tool (or a call escalated to critical)
      // can never become ALWAYS_ALLOW, so the card must not have offered it.
      if (stored.riskTier !== 'standard') throw AgentToolPermissionService.notAllowed(first.toolName);
      const principal = await loadAgentPrincipal(userId);
      this.deps.permissions().assertCanAlwaysAllow(principal, first.toolName);
    }
    const idempotent = [AgentActionStatus.CONFIRMED, AgentActionStatus.EXECUTED, AgentActionStatus.FAILED];
    const state = await this.pendingOrSettled(userId, actionId, locale, idempotent);
    if ('settled' in state) return { action: state.settled, runId: null, remembered: false };

    const now = this.deps.now();
    const claimed = await prisma.agentPendingAction.updateMany({
      where: { id: actionId, userId, status: AgentActionStatus.PENDING, expiresAt: { gt: now } },
      data: { status: AgentActionStatus.CONFIRMED },
    });
    if (claimed.count !== 1) {
      // Lost a double-tap race (or it expired this instant): report the current state.
      const again = await this.pendingOrSettled(userId, actionId, locale, idempotent);
      if ('settled' in again) return { action: again.settled, runId: null, remembered: false };
      throw new ApiError(409, agentT(locale, 'action.handled'), true, { code: 'ACTION_HANDLED' });
    }

    const action = state.action;
    const closing = await executeAgentAction(this.deps.registry(), action, stored, locale, now);
    let remembered = false;
    if (remember && closing.status === 'EXECUTED') {
      try {
        const principal = await loadAgentPrincipal(userId);
        await this.deps.permissions().set(principal, action.toolName, 'ALWAYS_ALLOW');
        remembered = true;
      } catch (error) {
        console.error('[agent] could not store always-allow', { actionId, tool: action.toolName, error });
      }
    }
    const message = await prisma.$transaction((tx) =>
      closeAgentAction(tx, action, [AgentActionStatus.CONFIRMED], closing),
    );
    const run = await prisma.agentRun.findUnique({
      where: { id: action.runId },
      select: { locale: true, clientCaps: true },
    });
    let runId: string | null = null;
    try {
      runId = await this.deps.runService().enqueueFollowUpRun({
        userId,
        chatId: action.chatId,
        locale: headerLocale || run?.locale || stored.locale,
        messages: message ? [message] : [],
        clientCaps: run?.clientCaps ?? [],
      });
    } catch (error) {
      console.error('[agent] follow-up run not enqueued', { actionId, error });
    }
    return { action: await this.dto(actionId), runId, remembered };
  }

  async reject(
    userId: string,
    actionId: string,
    headerLocale?: string | null,
  ): Promise<{ action: AgentPendingActionDto; runId: null }> {
    const first = await this.loadOwned(userId, actionId);
    const locale = agentLang(headerLocale || readStoredActionArgs(first.args).locale);
    const state = await this.pendingOrSettled(userId, actionId, locale, [AgentActionStatus.REJECTED]);
    if ('settled' in state) return { action: state.settled, runId: null };
    const closed = await prisma.$transaction((tx) =>
      closeAgentAction(tx, state.action, [AgentActionStatus.PENDING], rejectedClosing(locale)),
    );
    if (!closed) {
      const again = await this.pendingOrSettled(userId, actionId, locale, [AgentActionStatus.REJECTED]);
      if ('settled' in again) return { action: again.settled, runId: null };
    }
    return { action: await this.dto(actionId), runId: null };
  }
}

export function createAgentActionService(overrides: Partial<AgentActionServiceDeps> = {}): AgentActionService {
  return new AgentActionService({
    registry: getAgentToolRegistry,
    permissions: getAgentToolPermissionService,
    runService: getAgentRunService,
    now: () => new Date(),
    ...overrides,
  });
}

let defaultActionService: AgentActionService | null = null;

export function getAgentActionService(): AgentActionService {
  if (!defaultActionService) defaultActionService = createAgentActionService();
  return defaultActionService;
}

/** `remembered`: confirm stored ALWAYS_ALLOW for the tool (`remember: 'always'`, executed). */
export type AgentActionDecision = { action: AgentPendingActionDto; runId: string | null; remembered?: boolean };

/**
 * Channel-neutral entry points (HTTP route, Telegram, …). Only `principal.userId` is
 * used to scope the action (foreign / unknown ids → 404 `ApiError`); confirm re-loads
 * the principal from the DB itself before re-authorizing, so a caller's stale flags
 * never grant anything. `locale` picks the result language (default: the proposal's).
 * Errors are `ApiError`s: 404 not found, 409 `ACTION_EXPIRED` / `ACTION_HANDLED`.
 */
export function confirmAgentAction(
  principal: Pick<AgentPrincipal, 'userId'>,
  actionId: string,
  options: { locale?: string | null; remember?: AgentConfirmRemember | null } = {},
): Promise<AgentActionDecision> {
  return getAgentActionService().confirm(principal.userId, actionId, options.locale ?? null, {
    remember: options.remember ?? null,
  });
}

/** Reject: REJECTED + "declined" outcome in history; never starts a run (`runId: null`). */
export function rejectAgentAction(
  principal: Pick<AgentPrincipal, 'userId'>,
  actionId: string,
  options: { locale?: string | null } = {},
): Promise<AgentActionDecision> {
  return getAgentActionService().reject(principal.userId, actionId, options.locale ?? null);
}
