/**
 * Client-executed actions (booking plan §14.5, docs/domains/agent.md "Client-executed
 * actions"). Booktime / Padeloo / Klikteren writes run in the app on Confirm:
 *
 *   claim  (`POST /agent/actions/:id/claim {clientKey}`), owner only (foreign ids 404):
 *     fresh principal → the tool's `confirm.authorize` (lost rights → FAILED + follow-up
 *     run, no attempt) → PENDING → CONFIRMED by a conditional `updateMany` with a new
 *     `attemptId` and a 3 min lease → `{ attemptId, clientPlan, leaseExpiresAt }`.
 *     The same `clientKey` within the lease gets the same attempt; another key → 409.
 *   report (`POST /agent/actions/:id/report {attemptId, results}`): attempt must match
 *     (else 409 ACTION_HANDLED) → results checked against the plan (400) → `reportedAt`
 *     claimed once → the tool's registered post-step (`clientPostSteps.ts`) → EXECUTED
 *     (maybe `partial`) / FAILED → outcome in history + QUEUED follow-up run, as confirm.
 *     A repeat after EXECUTED/FAILED returns the current state; a late report upgrades
 *     UNKNOWN (lease swept, `clientLease.ts`).
 * `/confirm` on these actions → 409 CLIENT_EXECUTION_REQUIRED (`agentActions.service.ts`);
 * auto-approve skips them (`agentActionAutoApprove.ts`).
 */
import { randomUUID } from 'node:crypto';
import { AgentActionStatus, Prisma, type AgentMessage, type AgentPendingAction } from '@prisma/client';
import type {
  AgentClientClaimResponse,
  AgentClientReportRequest,
  AgentPendingActionDto,
} from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { loadAgentPrincipal } from '../access/agentPrincipal';
import {
  agentFailureModelNote,
  closingFromAgentWriteOutcome,
  describeAgentActionFailure,
} from '../agentActionExecute';
import {
  closeAgentAction,
  completeAwaitingRunIfDone,
  expireStaleAgentActions,
  readStoredActionArgs,
  type AgentActionClosing,
  type AgentStoredActionArgs,
} from '../agentActionOutcome';
import { toAgentPendingActionDto } from '../agentChat.service';
import { getAgentRunService, type AgentRunService } from '../agentRun.service';
import { agentLang, agentT } from '../i18n/agentI18n';
import { getAgentToolRegistry } from '../tools';
import type { AgentToolRegistry, AgentWriteOutcome } from '../tools/registry';
import { agentClientExecT } from './clientExecutionI18n';
import {
  AGENT_CLIENT_LEASE_MS,
  AGENT_CLIENT_REPORT_STALE_MS,
  sweepExpiredAgentClientLeases,
  unknownClosing,
} from './clientLease';
import { readClientExecutedPlan, type AgentClientExecutedPlan } from './clientPlan';
import { getAgentClientPostStep } from './clientPostSteps';
import { validateAgentClientReport, type ValidatedClientReport } from './clientReport';

export type AgentClientExecutionDeps = {
  registry: () => AgentToolRegistry;
  runService: () => Pick<AgentRunService, 'enqueueFollowUpRun'>;
  now: () => Date;
};

function handled(locale: string, message?: string): ApiError {
  return new ApiError(409, message ?? agentT(locale, 'action.handled'), true, { code: 'ACTION_HANDLED' });
}

export class AgentClientExecutionService {
  constructor(private readonly deps: AgentClientExecutionDeps) {}

  private async loadOwned(userId: string, actionId: string): Promise<AgentPendingAction> {
    const action = await prisma.agentPendingAction.findFirst({ where: { id: actionId, userId } });
    if (!action) throw new ApiError(404, 'Action not found');
    return action;
  }

  private async dto(actionId: string): Promise<AgentPendingActionDto> {
    return toAgentPendingActionDto(await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: actionId } }));
  }

  private clientPlanOf(stored: AgentStoredActionArgs): AgentClientExecutedPlan {
    const plan = readClientExecutedPlan(stored.plan);
    if (!plan) {
      throw new ApiError(400, 'This action is not executed by the app; use confirm', true, {
        code: 'validation.invalidInput',
      });
    }
    return plan;
  }

  private async followUp(action: AgentPendingAction, message: AgentMessage | null, headerLocale: string | null) {
    const run = await prisma.agentRun.findUnique({
      where: { id: action.runId },
      select: { locale: true, clientCaps: true, voice: true },
    });
    try {
      return await this.deps.runService().enqueueFollowUpRun({
        userId: action.userId,
        chatId: action.chatId,
        locale: headerLocale || run?.locale || readStoredActionArgs(action.args).locale,
        messages: message ? [message] : [],
        clientCaps: run?.clientCaps ?? [],
        voice: run?.voice ?? false,
      });
    } catch (error) {
      console.error('[agent] follow-up run not enqueued', { actionId: action.id, error });
      return null;
    }
  }

  private async claimedResponse(action: AgentPendingAction, plan: AgentClientExecutedPlan): Promise<AgentClientClaimResponse> {
    return {
      action: await this.dto(action.id),
      attemptId: action.attemptId,
      clientPlan: plan.clientPlan,
      leaseExpiresAt: action.leaseExpiresAt?.toISOString() ?? null,
      runId: null,
    };
  }

  /** Not claimable any more: settled states answer with the action, the rest 409. */
  private async settledClaim(action: AgentPendingAction, locale: string): Promise<AgentClientClaimResponse> {
    const settled: AgentActionStatus[] = [AgentActionStatus.EXECUTED, AgentActionStatus.FAILED, AgentActionStatus.UNKNOWN];
    if (settled.includes(action.status)) {
      return { action: toAgentPendingActionDto(action), attemptId: null, clientPlan: null, leaseExpiresAt: null, runId: null };
    }
    if (action.status === AgentActionStatus.EXPIRED) {
      throw new ApiError(409, agentT(locale, 'action.expired'), true, { code: 'ACTION_EXPIRED' });
    }
    if (action.status === AgentActionStatus.CONFIRMED) throw handled(locale, agentClientExecT(locale, 'claimedElsewhere'));
    throw handled(locale);
  }

  async claim(
    userId: string,
    actionId: string,
    clientKey: string,
    headerLocale?: string | null,
  ): Promise<AgentClientClaimResponse> {
    let action = await this.loadOwned(userId, actionId);
    const stored = readStoredActionArgs(action.args);
    const locale = agentLang(headerLocale || stored.locale);
    const plan = this.clientPlanOf(stored);
    const now = this.deps.now();

    if (action.status === AgentActionStatus.CONFIRMED && action.leaseExpiresAt && action.leaseExpiresAt <= now) {
      await sweepExpiredAgentClientLeases(now, { actionId });
      action = await this.loadOwned(userId, actionId);
    }
    if (action.status === AgentActionStatus.PENDING && action.expiresAt <= now) {
      await expireStaleAgentActions({ actionId }, now);
      action = await this.loadOwned(userId, actionId);
    }
    if (isSameLiveClaim(action, clientKey, now)) return this.claimedResponse(action, plan);
    if (action.status !== AgentActionStatus.PENDING) return this.settledClaim(action, locale);

    // Re-authorize before anything reaches the device: fresh principal, the tool's guard.
    try {
      const tool = this.deps.registry().get(action.toolName);
      if (!tool?.confirm || tool.kind !== 'write') throw new Error(`no confirm guard for ${action.toolName}`);
      const principal = await loadAgentPrincipal(userId);
      if (tool.scope === 'admin' && !principal.isAdmin) throw new ApiError(403, 'Admin only');
      await tool.confirm.authorize(principal, stored.plan);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('[agent] client claim guard failed', { actionId, error });
      const failure = describeAgentActionFailure(error, locale);
      const closing: AgentActionClosing = {
        status: 'FAILED',
        result: { ok: false, message: failure.message },
        modelStatus: 'failed',
        modelNote: agentFailureModelNote(false, failure.modelError, { changed: false }),
        error: (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 2000),
      };
      const message = await prisma.$transaction((tx) =>
        closeAgentAction(tx, action, [AgentActionStatus.PENDING], closing),
      );
      if (!message) return this.settledClaim(await this.loadOwned(userId, actionId), locale);
      const runId = await this.followUp(action, message, headerLocale ?? null);
      return { action: await this.dto(actionId), attemptId: null, clientPlan: null, leaseExpiresAt: null, runId };
    }

    const claimed = await prisma.agentPendingAction.updateMany({
      where: { id: actionId, userId, status: AgentActionStatus.PENDING, expiresAt: { gt: now } },
      data: {
        status: AgentActionStatus.CONFIRMED,
        attemptId: randomUUID(),
        claimKey: clientKey,
        leaseExpiresAt: new Date(now.getTime() + AGENT_CLIENT_LEASE_MS),
        reportedAt: null,
      },
    });
    const after = await this.loadOwned(userId, actionId);
    if (claimed.count !== 1) {
      if (isSameLiveClaim(after, clientKey, now)) return this.claimedResponse(after, plan);
      return this.settledClaim(after, locale);
    }
    await completeAwaitingRunIfDone(prisma, after.runId);
    return this.claimedResponse(after, plan);
  }

  async report(
    userId: string,
    actionId: string,
    body: AgentClientReportRequest,
    headerLocale?: string | null,
  ): Promise<{ action: AgentPendingActionDto; runId: string | null }> {
    const action = await this.loadOwned(userId, actionId);
    const stored = readStoredActionArgs(action.args);
    const locale = agentLang(headerLocale || stored.locale);
    const plan = this.clientPlanOf(stored);
    if (!action.attemptId || action.attemptId !== body.attemptId) throw handled(locale);
    if (action.status === AgentActionStatus.EXECUTED || action.status === AgentActionStatus.FAILED) {
      return { action: toAgentPendingActionDto(action), runId: null };
    }
    if (action.status !== AgentActionStatus.CONFIRMED && action.status !== AgentActionStatus.UNKNOWN) {
      throw handled(locale);
    }
    // UNKNOWN from an earlier report of this attempt (rollback failed) is final; only a
    // lease-swept UNKNOWN (no stored report) is upgraded by a late report.
    if (action.status === AgentActionStatus.UNKNOWN && storedReportAttemptId(action.args) === body.attemptId) {
      return { action: toAgentPendingActionDto(action), runId: null };
    }
    const report = validateAgentClientReport(plan.clientPlan, body.results);

    // One post-step per attempt: the first report claims `reportedAt` (a lost one can retry).
    const now = this.deps.now();
    const args = (action.args && typeof action.args === 'object' ? action.args : {}) as Prisma.JsonObject;
    const reporting = await prisma.agentPendingAction.updateMany({
      where: {
        id: actionId,
        attemptId: body.attemptId,
        status: { in: [AgentActionStatus.CONFIRMED, AgentActionStatus.UNKNOWN] },
        OR: [{ reportedAt: null }, { reportedAt: { lt: new Date(now.getTime() - AGENT_CLIENT_REPORT_STALE_MS) } }],
      },
      data: {
        reportedAt: now,
        args: {
          ...args,
          report: { attemptId: body.attemptId, at: now.toISOString(), results: report.results },
        } as unknown as Prisma.InputJsonValue,
      },
    });
    if (reporting.count !== 1) {
      const current = await this.loadOwned(userId, actionId);
      if (current.status === AgentActionStatus.EXECUTED || current.status === AgentActionStatus.FAILED) {
        return { action: toAgentPendingActionDto(current), runId: null };
      }
      throw handled(locale);
    }

    const closing = await this.postStepClosing(action, stored, plan, report, locale, now);
    const message = await prisma.$transaction((tx) =>
      closeAgentAction(tx, action, [AgentActionStatus.CONFIRMED, AgentActionStatus.UNKNOWN], closing),
    );
    const runId = message ? await this.followUp(action, message, headerLocale ?? null) : null;
    return { action: await this.dto(actionId), runId };
  }

  private async postStepClosing(
    action: AgentPendingAction,
    stored: AgentStoredActionArgs,
    plan: AgentClientExecutedPlan,
    report: ValidatedClientReport,
    locale: string,
    now: Date,
  ): Promise<AgentActionClosing> {
    const counts = { planned: report.planned, succeeded: report.succeeded.length };
    if (report.rollback) return rollbackClosing(report, locale, counts);
    if (report.succeeded.length === 0) {
      const message = agentClientExecT(locale, 'nothing');
      const errors = report.results.map((r) => r.error).filter((e): e is string => Boolean(e));
      return {
        status: 'FAILED',
        result: { ok: false, message },
        modelStatus: 'failed',
        modelNote: agentFailureModelNote(false, 'provider_rejected', { changed: false, message }),
        modelData: counts,
        error: errors.length ? errors.join('; ').slice(0, 2000) : null,
      };
    }
    const partialByCount = report.succeeded.length < report.planned;
    const handler = getAgentClientPostStep(action.toolName);
    let outcome: AgentWriteOutcome;
    let error: string | null = null;
    if (!handler) {
      outcome = {
        message: partialByCount
          ? agentClientExecT(locale, 'partial', { done: counts.succeeded, planned: counts.planned })
          : agentClientExecT(locale, 'done'),
      };
    } else {
      try {
        const principal = await loadAgentPrincipal(action.userId);
        outcome = await handler(
          { principal, locale, timezone: stored.timezone, now },
          {
            actionId: action.id,
            clientPlan: plan.clientPlan,
            post: plan.post,
            results: report.results,
            succeeded: report.succeeded,
            planned: report.planned,
          },
        );
      } catch (caught) {
        console.error('[agent] client post-step failed', { actionId: action.id, tool: action.toolName, error: caught });
        outcome = { message: agentClientExecT(locale, 'postStepFailed'), partial: true };
        error = (caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught)).slice(0, 2000);
      }
    }
    if (partialByCount && !outcome.failed) outcome = { ...outcome, partial: true };
    const closing = closingFromAgentWriteOutcome(outcome, now, false);
    return { ...closing, modelData: { ...(closing.modelData ?? {}), ...counts }, error };
  }
}

function storedReportAttemptId(args: Prisma.JsonValue): string | null {
  const report = args && typeof args === 'object' && !Array.isArray(args) ? (args as Prisma.JsonObject).report : null;
  const attemptId = report && typeof report === 'object' && !Array.isArray(report) ? report.attemptId : null;
  return typeof attemptId === 'string' ? attemptId : null;
}

/**
 * A multi-court booking the app rolled back (booking plan §14.6): no post-step. Every court
 * undone → FAILED "nothing booked"; an undo failed / unknown → UNKNOWN naming those courts.
 */
async function rollbackClosing(
  report: ValidatedClientReport,
  locale: string,
  counts: { planned: number; succeeded: number },
): Promise<AgentActionClosing> {
  const errors = report.results.map((r) => r.error).filter((e): e is string => Boolean(e));
  const error = errors.length ? errors.join('; ').slice(0, 2000) : null;
  const stillBooked = report.rollback?.stillBooked ?? [];
  if (stillBooked.length === 0) {
    const message = agentClientExecT(locale, 'rolledBack');
    return {
      status: 'FAILED',
      result: { ok: false, message },
      modelStatus: 'failed',
      modelNote: agentFailureModelNote(false, 'provider_rejected', { changed: false, message }),
      modelData: { ...counts, rolledBack: true },
      error,
    };
  }
  const ids = stillBooked.map((r) => r.courtId).filter((id): id is string => Boolean(id));
  const courts = await prisma.court.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = ids.map((id) => courts.find((c) => c.id === id)?.name ?? id).join(', ');
  const base = unknownClosing(locale);
  return {
    ...base,
    result: { ...base.result, message: agentClientExecT(locale, 'rollbackFailed', { courts: names }) },
    modelNote: `Not every court could be booked, and the app could not cancel the ones it had booked again: ${names} may still be booked (outcome UNKNOWN). Tell the user to check Club bookings in the app. Do not retry without asking.`,
    modelData: { ...counts, rolledBack: false, stillBookedCourts: names },
    error,
  };
}

function isSameLiveClaim(action: AgentPendingAction, clientKey: string, now: Date): boolean {
  return (
    action.status === AgentActionStatus.CONFIRMED &&
    Boolean(action.attemptId) &&
    action.claimKey === clientKey &&
    Boolean(action.leaseExpiresAt && action.leaseExpiresAt > now)
  );
}

export function createAgentClientExecutionService(
  overrides: Partial<AgentClientExecutionDeps> = {},
): AgentClientExecutionService {
  return new AgentClientExecutionService({
    registry: getAgentToolRegistry,
    runService: getAgentRunService,
    now: () => new Date(),
    ...overrides,
  });
}

let defaultService: AgentClientExecutionService | null = null;

export function getAgentClientExecutionService(): AgentClientExecutionService {
  if (!defaultService) defaultService = createAgentClientExecutionService();
  return defaultService;
}
