/**
 * Agent runs: queue + loop (docs/domains/agent.md, docs/plans/ai-agent.md §1, §7).
 *
 * API side (`enqueueRun`): POST message saves the USER message and an `AgentRun(QUEUED)`
 * under a row lock on the chat (one QUEUED/RUNNING run per chat → 409 `CHAT_BUSY`; more
 * than `AGENT_MAX_QUEUED_RUNS_PER_USER` queued → 429 `RATE_LIMITED`), emits `run.queued`
 * and wakes the workers. No LLM work happens in the request.
 *
 * Worker side (`start` / `drain`, via `AgentRunQueueService` from `startQueueWorkers`):
 * the `AgentRun` table is the durable queue. A claim runs under a Postgres advisory lock:
 * oldest QUEUED run whose user has fewer than `AGENT_MAX_CONCURRENT_RUNS_PER_USER` RUNNING
 * runs → RUNNING. At most `AGENT_MAX_CONCURRENT_RUNS` execute per process, and outbound LLM
 * calls share a `AGENT_MAX_CONCURRENT_LLM_CALLS` semaphore. After every claim/cancel the
 * remaining QUEUED runs get a `run.queued` with their new position.
 *
 * Loop, per step (≤ `AGENT_MAX_STEPS`; the last step gets no tools so it must answer):
 *   stream completion → `text.delta` → if tool calls: save ASSISTANT message (text +
 *   tool_call blocks) → `message.saved` → per call `tool.started` / registry.executeTool /
 *   `tool.finished` → save TOOL message → `message.saved` → next step. No tool calls: save
 *   ASSISTANT text → `message.saved` → `run.completed`. Wall clock `AGENT_RUN_TIMEOUT_MS`
 *   from claim. The executor heartbeats every 2s; a heartbeat that finds the row no longer
 *   RUNNING (cancelled from another process) aborts the loop. Runs never depend on an SSE
 *   listener.
 *
 * Recovery: RUNNING rows are never re-executed (a half-done run may have produced messages
 * and, from phase 3, pending writes). Ownership is a lease: the claiming process stamps
 * its per-boot `workerId` and refreshes `heartbeatAt` every 2s. A RUNNING row is failed
 * (`INTERNAL`, "interrupted") only when its heartbeat is older than `AGENT_STALE_RUN_MS` —
 * on start and by the periodic sweep, whatever host or process owns it (API, worker and
 * test processes share the table, often on one host); QUEUED
 * rows simply stay in the table and are claimed after a restart; QUEUED longer than
 * `AGENT_QUEUE_MAX_WAIT_MS` fails with `TIMEOUT`.
 *
 * Phase-3 hook: a write tool's handler returns `awaitingConfirmation: { actionId }` after
 * saving an `AgentPendingAction`; the loop appends an `action` block, emits
 * `action.pending` and ends the run as `AWAITING_CONFIRMATION`. Phase 8: when the user
 * always allows that standard-tier tool, `deps.autoApprove` executes it at once (same
 * re-authorize → execute path as a tap); the outcome is the call's tool result, an
 * `action.pending` with the settled action is emitted, and the loop continues. Taint: once
 * a read tool declaring `untrustedContent` (game chat, web search / fetch) succeeds, the run
 * is tainted and no later write in it auto-approves (normal card). In-memory per run is
 * enough: RUNNING rows are never re-executed.
 *
 * Phase 11 memory: every call gets `memoryProvenance` (run taint OR an `untrustedContent`
 * call anywhere in this chat's history; whether the latest user message asked to remember).
 * `save_memory` refuses on taint unless the user asked. A successful save emits
 * `memory.saved` right after its `tool.finished` (no card, no pause).
 */
import os from 'node:os';
import { AgentMessageRole, AgentRunStatus, Prisma, type AgentMessage, type AgentRun } from '@prisma/client';
import type {
  AgentContentBlock,
  AgentErrorCode,
  AgentMessageDto,
  AgentPendingActionDto,
  AgentStreamEvent,
  AgentUsage,
} from '@bandeja/shared/agentContract';
import { AGENT_MESSAGE_MAX_LENGTH } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { config } from '../../config/env';
import type { AgentEnvConfig } from '../../config/agentEnv';
import { ApiError } from '../../utils/ApiError';
import { LLM_REASON } from '../ai/llmReasons';
import { logLlmUsage, type LlmUsageLogEntry } from '../ai/llmUsageLog.service';
import { getRedisClient } from '../redis/redisClient';
import { loadAgentPrincipal } from './access/agentPrincipal';
import {
  autoApproveAgentAction,
  type AgentAutoApproveOptions,
  type AgentAutoApproveResult,
} from './agentActionAutoApprove';
import { expireStaleAgentActions, supersedePendingAgentActions } from './agentActionOutcome';
import { sweepExpiredAgentClientLeases } from './clientExecution/clientLease';
import {
  appendAgentMessage,
  agentChatNotFound,
  autoTitleFromText,
  requireOwnedAgentChat,
  rewindAgentChatToMessage,
  toAgentMessageDto,
  toAgentPendingActionDto,
} from './agentChat.service';
import {
  agentMemoryProvenanceFromHistory,
  buildAgentModelHistory,
  buildAgentRunContext,
  type AgentChatSummaryState,
  type HistoryMessage,
} from './agentContext.service';
import {
  AGENT_CHAT_SUMMARY_BUDGET_RESERVE,
  agentChatSummaryFromRow,
  planAgentChatSummary,
  updateAgentChatSummary,
} from './agentChatSummary.service';
import { userAskedToRemember } from './agentMemory.service';
import { getAgentEventStore, type AgentEventStore, type AgentStoredEvent } from './agentEvents';
import { agentApiError, agentTokensUsedToday, assertAgentBudget } from './agentGuards';
import { agentT } from './i18n/agentI18n';
import {
  AgentLlmError,
  getDefaultAgentLlmClient,
  ToolCallAccumulator,
  type AgentLlmClient,
  type AgentLlmMessage,
  type AgentLlmToolCall,
} from './llm/deepseekStream';
import { Semaphore } from './llm/semaphore';
import { createAgentWebRunSession } from './web/agentWebSession';
import { getAgentToolRegistry } from './tools';
import type { AgentToolContext, AgentToolExecution, AgentToolRegistry } from './tools/registry';

const TOOL_CONTENT_MAX_CHARS = 16_000;
const USAGE_LOG_INPUT_MAX_CHARS = 20_000;
const HEARTBEAT_MS = 2_000;
const POSITION_BROADCAST_LIMIT = 200;
/** `pg_advisory_xact_lock` key serialising queue claims across processes. */
const AGENT_QUEUE_LOCK_KEY = 740_319_001;
export const AGENT_QUEUE_WAKE_CHANNEL = 'pp:agent-queue:wake';

const TERMINAL_RUN_STATUSES: AgentRunStatus[] = [
  AgentRunStatus.COMPLETED,
  AgentRunStatus.AWAITING_CONFIRMATION,
  AgentRunStatus.FAILED,
  AgentRunStatus.CANCELLED,
];

type AbortReason = 'cancelled' | 'timeout';

/** Per-run loop state kept across steps. */
type AgentRunLoopState = {
  /** An `untrustedContent` read tool returned content in this run: writes always ask. */
  tainted: boolean;
  /**
   * Phase 11 provenance guard (`save_memory`): an `untrustedContent` tool was called earlier
   * in this chat (any run), and whether the latest user message asked to remember something.
   */
  historyTainted: boolean;
  userAskedToRemember: boolean;
};

export type AgentRunDeps = {
  llm: () => AgentLlmClient | null;
  registry: AgentToolRegistry;
  events: AgentEventStore;
  config: () => AgentEnvConfig;
  now: () => Date;
  logUsage: (entry: LlmUsageLogEntry) => Promise<void>;
  /** Phase 3: DTO for `action.pending`. Default reads `AgentPendingAction` by id. */
  loadPendingAction: (actionId: string) => Promise<AgentPendingActionDto | null>;
  /**
   * Phase 8 (plan §15): executes a just-proposed action without a tap when the user always
   * allows its standard-tier tool (re-authorized; `agentActionAutoApprove.ts`). Null = ask.
   * `runTainted`: an `untrustedContent` read returned content earlier in this run → always ask.
   */
  autoApprove: (
    registry: AgentToolRegistry,
    actionId: string,
    now: Date,
    options?: AgentAutoApproveOptions,
  ) => Promise<AgentAutoApproveResult | null>;
  /** Tells other processes there is work (Redis pub/sub); no-op without Redis. */
  wake: () => Promise<void>;
  /** `host:role:pid:boot` — which process claimed a run. */
  workerId: string;
};

type ActiveRun = { controller: AbortController; userId: string; chatId: string; done: Promise<void> };

class RunAborted extends Error {
  constructor(readonly reason: AbortReason) {
    super(`run ${reason}`);
  }
}

function abortReasonOf(signal: AbortSignal): AbortReason {
  return signal.reason === 'timeout' ? 'timeout' : 'cancelled';
}

type JsonArrayRef = { path: string; array: unknown[] };

/** Arrays in `value` not nested in another array, with a readable path like `data.fixtures`. */
function collectArrays(value: unknown, path: string, out: JsonArrayRef[]): void {
  if (Array.isArray(value)) {
    out.push({ path, array: value });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) collectArrays(child, `${path}.${key}`, out);
  }
}

/**
 * Tool result for the model, ≤ `TOOL_CONTENT_MAX_CHARS`. An oversized result keeps valid
 * JSON: whole items are dropped from the end of the largest list(s) and `truncated` names
 * each cut list with how many items were omitted, so the model knows the list is
 * incomplete (a raw slice once hid a fixture and the model reported 4 games of 5).
 */
export function serializeToolContent(execution: Pick<AgentToolExecution, 'ok' | 'data'>): string {
  const json = JSON.stringify({ ok: execution.ok, data: execution.data });
  if (json.length <= TOOL_CONTENT_MAX_CHARS) return json;

  const data: unknown = JSON.parse(JSON.stringify(execution.data ?? null));
  const arrays: JsonArrayRef[] = [];
  collectArrays(data, 'data', arrays);
  const omitted = new Map<string, number>();
  const note =
    'INCOMPLETE: the result was too long, so the last items of the lists below were left out. Do not present these lists as complete: say so, or call the tool again with narrower filters (date, round, group, limit).';
  const render = () =>
    JSON.stringify({
      ok: execution.ok,
      truncated: { note, omitted: Object.fromEntries(omitted) },
      data,
    });
  let out = render();
  while (out.length > TOOL_CONTENT_MAX_CHARS) {
    // Trim the list that currently weighs the most.
    let target: JsonArrayRef | null = null;
    let targetSize = 0;
    for (const ref of arrays) {
      if (ref.array.length === 0) continue;
      const size = JSON.stringify(ref.array).length;
      if (size > targetSize) {
        target = ref;
        targetSize = size;
      }
    }
    if (!target) break;
    const drop = Math.max(1, Math.ceil(target.array.length * Math.min(0.5, (out.length - TOOL_CONTENT_MAX_CHARS) / targetSize)));
    target.array.splice(target.array.length - drop, drop);
    omitted.set(target.path, (omitted.get(target.path) ?? 0) + drop);
    out = render();
  }
  if (out.length <= TOOL_CONTENT_MAX_CHARS) return out;
  // No list left to trim (one huge string): still valid JSON, clearly marked.
  return JSON.stringify({ ok: execution.ok, truncated: { note }, partial: json.slice(0, TOOL_CONTENT_MAX_CHARS - 600) });
}

function parseToolArguments(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export function terminalEventForRun(
  run: Pick<AgentRun, 'status' | 'errorCode' | 'error' | 'inputTokens' | 'outputTokens'>,
): AgentStreamEvent {
  switch (run.status) {
    case AgentRunStatus.COMPLETED:
    case AgentRunStatus.AWAITING_CONFIRMATION:
      return {
        type: 'run.completed',
        status: run.status,
        usage: { inputTokens: run.inputTokens, outputTokens: run.outputTokens },
      };
    case AgentRunStatus.CANCELLED:
      return { type: 'run.cancelled' };
    default:
      return {
        type: 'run.failed',
        code: (run.errorCode as AgentErrorCode | null) ?? 'INTERNAL',
        message: run.status === AgentRunStatus.FAILED ? (run.error ?? null) : 'The run was interrupted',
      };
  }
}

/**
 * `host:role[pm2 instance]:pid:boot` — unique per process start. Diagnostic only: liveness
 * is decided by the heartbeat, never by comparing owners (another process on this host may
 * be alive and running its own claims).
 */
export function defaultAgentWorkerId(role: string): string {
  const slot = `${role}${process.env.NODE_APP_INSTANCE ?? ''}`;
  return `${os.hostname()}:${slot}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
}

async function publishAgentQueueWake(): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.publish(AGENT_QUEUE_WAKE_CHANNEL, '1');
  } catch (error) {
    console.error('[agent] queue wake publish failed', error);
  }
}

export class AgentRunService {
  private readonly active = new Map<string, ActiveRun>();
  private readonly lastPositions = new Map<string, number>();
  private readonly llmGate: Semaphore;
  private draining: Promise<void> | null = null;
  private drainAgain = false;
  private stopped = true;

  constructor(private readonly deps: AgentRunDeps) {
    this.llmGate = new Semaphore(() => this.deps.config().maxConcurrentLlmCalls);
  }

  get events(): AgentEventStore {
    return this.deps.events;
  }

  get workerId(): string {
    return this.deps.workerId;
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  activeCount(): number {
    return this.active.size;
  }

  llmCallsInFlight(): number {
    return this.llmGate.active;
  }

  private emit(runId: string, event: AgentStreamEvent): Promise<AgentStoredEvent | null> {
    return this.deps.events.append(runId, event);
  }

  // --- API side ------------------------------------------------------------------------------

  async enqueueRun(input: {
    userId: string;
    chatId: string;
    text: string;
    /** Edit: this USER message and everything after it are deleted; `text` replaces it. */
    editMessageId?: string | null;
    headerLocale?: string | null;
    /** `X-Agent-Client-Caps`, already parsed (`clientExecution/clientCaps.ts`). */
    clientCaps?: readonly string[] | null;
  }): Promise<{ message: AgentMessageDto; runId: string }> {
    const text = input.text.trim();
    if (!text) throw new ApiError(400, 'Message is empty', true, { code: 'validation.invalidInput' });
    if (text.length > AGENT_MESSAGE_MAX_LENGTH) {
      throw new ApiError(400, `Message is longer than ${AGENT_MESSAGE_MAX_LENGTH} characters`, true, {
        code: 'validation.invalidInput',
      });
    }
    await requireOwnedAgentChat(input.userId, input.chatId);
    const agentConfig = this.deps.config();
    const llm = this.deps.llm();
    if (!llm) throw agentApiError(503, 'LLM_ERROR', 'The AI assistant is not configured');
    const now = this.deps.now();
    await assertAgentBudget(input.userId, agentConfig.dailyTokenBudget, now);
    const locale = (input.headerLocale ?? '').trim().slice(0, 16) || null;

    const { run, message } = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; title: string | null; archivedAt: Date | null }[]>`
        SELECT id, title, "archivedAt" FROM "AgentChat"
        WHERE id = ${input.chatId} AND "userId" = ${input.userId} AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (locked.length === 0) throw agentChatNotFound();
      // Writing in an archived chat moves it back to the main list.
      if (locked[0].archivedAt) {
        await tx.agentChat.update({ where: { id: input.chatId }, data: { archivedAt: null } });
      }

      const busy = await tx.agentRun.findFirst({
        where: { chatId: input.chatId, status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] } },
        select: { id: true, status: true, heartbeatAt: true, startedAt: true, workerId: true },
      });
      if (busy && !(await this.failIfStale(busy, tx))) {
        throw agentApiError(409, 'CHAT_BUSY', 'The assistant is still answering in this chat');
      }
      const queuedForUser = await tx.agentRun.count({
        where: { userId: input.userId, status: AgentRunStatus.QUEUED },
      });
      if (queuedForUser >= agentConfig.maxQueuedRunsPerUser) {
        throw agentApiError(429, 'RATE_LIMITED', 'Too many questions waiting. Try again when one finishes.');
      }

      // A new user message supersedes any unconfirmed action (plan §6.5): EXPIRED, with a
      // tool outcome in the history so the model knows the change was not made.
      await supersedePendingAgentActions(tx, input.chatId);
      await tx.agentRun.updateMany({
        where: { chatId: input.chatId, status: AgentRunStatus.AWAITING_CONFIRMATION },
        data: { status: AgentRunStatus.COMPLETED },
      });

      // Edit: rewind after superseding, so outcome messages it appended go with the dropped turns.
      // Action rows stay (audit); their cards lived in the dropped messages.
      let title = locked[0].title;
      if (input.editMessageId) {
        title = await rewindAgentChatToMessage(tx, input.chatId, input.editMessageId, title);
      }

      const createdRun = await tx.agentRun.create({
        data: {
          chatId: input.chatId,
          userId: input.userId,
          status: AgentRunStatus.QUEUED,
          model: llm.model,
          locale,
          clientCaps: [...(input.clientCaps ?? [])],
          createdAt: now,
        },
      });
      const userMessage = await appendAgentMessage(
        { chatId: input.chatId, role: AgentMessageRole.USER, blocks: [{ type: 'text', text }], runId: createdRun.id },
        tx,
      );
      if (!title) {
        await tx.agentChat.update({ where: { id: input.chatId }, data: { title: autoTitleFromText(text) || null } });
      }
      return { run: createdRun, message: userMessage };
    });

    await this.deps.events.open(run.id);
    const position = await this.queuePosition(run);
    this.lastPositions.set(run.id, position);
    await this.emit(run.id, { type: 'run.queued', runId: run.id, chatId: run.chatId, position });
    void this.deps.wake();
    if (!this.stopped) void this.drain();
    return { message: toAgentMessageDto(message), runId: run.id };
  }

  /**
   * Short QUEUED run after a confirmed write so the model reports the outcome (never run
   * inline). No USER message. Returns null (and enqueues nothing) when the chat is busy
   * or archived, the user is over the queued cap or daily budget, or no LLM is configured:
   * the write itself already happened and the card shows its result.
   * `messages` are emitted as `message.saved` on the new run's log (the outcome message).
   */
  async enqueueFollowUpRun(input: {
    userId: string;
    chatId: string;
    locale: string | null;
    messages?: AgentMessage[];
    /** Inherited from the run that proposed the action (the app that confirmed it). */
    clientCaps?: readonly string[] | null;
  }): Promise<string | null> {
    const agentConfig = this.deps.config();
    const llm = this.deps.llm();
    if (!llm) return null;
    const now = this.deps.now();
    try {
      await assertAgentBudget(input.userId, agentConfig.dailyTokenBudget, now);
    } catch {
      return null;
    }
    const run = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "AgentChat"
        WHERE id = ${input.chatId} AND "userId" = ${input.userId} AND "deletedAt" IS NULL
        FOR UPDATE`;
      if (locked.length === 0) return null;
      const busy = await tx.agentRun.findFirst({
        where: { chatId: input.chatId, status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] } },
        select: { id: true, status: true, heartbeatAt: true, startedAt: true, workerId: true },
      });
      if (busy && !(await this.failIfStale(busy, tx))) return null;
      const queuedForUser = await tx.agentRun.count({ where: { userId: input.userId, status: AgentRunStatus.QUEUED } });
      if (queuedForUser >= agentConfig.maxQueuedRunsPerUser) return null;
      return tx.agentRun.create({
        data: {
          chatId: input.chatId,
          userId: input.userId,
          status: AgentRunStatus.QUEUED,
          model: llm.model,
          locale: (input.locale ?? '').trim().slice(0, 16) || null,
          clientCaps: [...(input.clientCaps ?? [])],
          createdAt: now,
        },
      });
    });
    if (!run) return null;
    await this.deps.events.open(run.id);
    const position = await this.queuePosition(run);
    this.lastPositions.set(run.id, position);
    await this.emit(run.id, { type: 'run.queued', runId: run.id, chatId: run.chatId, position });
    for (const message of input.messages ?? []) {
      await this.emit(run.id, { type: 'message.saved', message: toAgentMessageDto(message) });
    }
    void this.deps.wake();
    if (!this.stopped) void this.drain();
    return run.id;
  }

  private async queuePosition(run: Pick<AgentRun, 'id' | 'createdAt'>): Promise<number> {
    const ahead = await prisma.agentRun.count({
      where: {
        status: AgentRunStatus.QUEUED,
        OR: [{ createdAt: { lt: run.createdAt } }, { createdAt: run.createdAt, id: { lt: run.id } }],
      },
    });
    return ahead + 1;
  }

  /** Owner-only. Idempotent: finished runs answer ok. Unknown / foreign ids → 404. */
  async cancelRun(userId: string, runId: string): Promise<void> {
    const run = await prisma.agentRun.findFirst({ where: { id: runId, userId }, select: { id: true, status: true } });
    if (!run) throw new ApiError(404, 'Run not found');
    if (run.status === AgentRunStatus.QUEUED) {
      const updated = await prisma.agentRun.updateMany({
        where: { id: runId, status: AgentRunStatus.QUEUED },
        data: { status: AgentRunStatus.CANCELLED, endedAt: this.deps.now() },
      });
      if (updated.count === 1) {
        await this.deps.events.open(runId, { resumed: !(await this.deps.events.has(runId)) });
        await this.emit(runId, { type: 'run.cancelled' });
        this.lastPositions.delete(runId);
        await this.broadcastQueuePositions();
        return;
      }
      // Claimed meanwhile: fall through to the RUNNING path.
    }
    const active = this.active.get(runId);
    if (active) {
      active.controller.abort('cancelled');
      await active.done;
      return;
    }
    // Executing in another process: its heartbeat sees the status change and aborts
    // (saving partial text, then emitting `run.cancelled`).
    await prisma.agentRun.updateMany({
      where: { id: runId, status: AgentRunStatus.RUNNING },
      data: { status: AgentRunStatus.CANCELLED, endedAt: this.deps.now() },
    });
  }

  /** Cancels whatever is queued/running in a chat (archive). */
  async cancelChatRuns(userId: string, chatId: string): Promise<void> {
    const runs = await prisma.agentRun.findMany({
      where: { chatId, userId, status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] } },
      select: { id: true },
    });
    await Promise.all(runs.map((run) => this.cancelRun(userId, run.id)));
  }

  /**
   * For the SSE route when the store has no log for a run that is not finished: re-open a
   * log so the client can stream live. Returns false when the run is (or is now) finished
   * and should be replayed from the DB instead.
   */
  async ensureLiveLog(run: AgentRun): Promise<boolean> {
    if (run.status === AgentRunStatus.QUEUED) {
      await this.deps.events.open(run.id, { resumed: true });
      const position = await this.queuePosition(run);
      await this.emit(run.id, { type: 'run.queued', runId: run.id, chatId: run.chatId, position });
      return true;
    }
    if (run.status === AgentRunStatus.RUNNING) {
      if (await this.failIfStale(run)) return false;
      await this.deps.events.open(run.id, { resumed: true });
      await this.emit(run.id, { type: 'run.started', runId: run.id, chatId: run.chatId });
      return true;
    }
    return false;
  }

  /**
   * SSE keepalive tick: if the DB says the run is over but its log never got a terminal
   * event (executor died, or it was finalised elsewhere), append one so listeners close.
   */
  async reconcileTerminal(runId: string): Promise<void> {
    if (this.active.has(runId)) return;
    if (await this.deps.events.isTerminal(runId)) return;
    const run = await prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (run.status === AgentRunStatus.RUNNING) {
      if (await this.failIfStale(run)) {
        const failed = await prisma.agentRun.findUnique({ where: { id: runId } });
        if (failed) await this.emit(runId, terminalEventForRun(failed));
      }
      return;
    }
    if (!TERMINAL_RUN_STATUSES.includes(run.status)) return;
    const endedAt = run.endedAt?.getTime() ?? 0;
    if (this.deps.now().getTime() - endedAt < 5_000) return; // give the executor time to emit
    await this.emit(runId, terminalEventForRun(run));
  }

  /**
   * Events for a run whose live log is gone: `run.started`, every saved message of the run,
   * pending actions, then a terminal event built from `AgentRun`.
   */
  async buildSyntheticEvents(run: AgentRun): Promise<AgentStreamEvent[]> {
    let current = run;
    if (run.status === AgentRunStatus.RUNNING && (await this.failIfStale(run))) {
      current = (await prisma.agentRun.findUnique({ where: { id: run.id } })) ?? run;
    }
    const [messages, actions] = await Promise.all([
      prisma.agentMessage.findMany({
        where: { runId: run.id, role: { in: [AgentMessageRole.ASSISTANT, AgentMessageRole.TOOL] } },
        orderBy: { seq: 'asc' },
      }),
      prisma.agentPendingAction.findMany({ where: { runId: run.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return [
      { type: 'run.started', runId: run.id, chatId: run.chatId },
      ...messages.map((message): AgentStreamEvent => ({ type: 'message.saved', message: toAgentMessageDto(message) })),
      ...actions.map((action): AgentStreamEvent => ({ type: 'action.pending', action: toAgentPendingActionDto(action) })),
      terminalEventForRun(current),
    ];
  }

  // --- worker side ---------------------------------------------------------------------------

  /** Starts polling + claiming in this process. */
  async start(): Promise<void> {
    this.stopped = false;
    // Recovery = the heartbeat sweep: RUNNING rows whose lease lapsed are failed.
    await this.sweep();
    void this.drain();
  }

  stop(): void {
    this.stopped = true;
  }

  /** Stale RUNNING → FAILED(INTERNAL); QUEUED too long → FAILED(TIMEOUT). */
  async sweep(): Promise<void> {
    const agentConfig = this.deps.config();
    const now = this.deps.now().getTime();
    const staleBefore = new Date(now - agentConfig.staleRunMs);
    const stale = await prisma.agentRun.findMany({
      where: {
        status: AgentRunStatus.RUNNING,
        OR: [{ heartbeatAt: { lt: staleBefore } }, { heartbeatAt: null, startedAt: { lt: staleBefore } }],
      },
      select: { id: true },
      take: 100,
    });
    for (const run of stale) {
      if (!this.active.has(run.id)) await this.failRun(run.id, 'INTERNAL', 'The run was interrupted');
    }
    const expired = await prisma.agentRun.findMany({
      where: { status: AgentRunStatus.QUEUED, createdAt: { lt: new Date(now - agentConfig.queueMaxWaitMs) } },
      select: { id: true },
      take: 100,
    });
    for (const run of expired) await this.failRun(run.id, 'TIMEOUT', 'The assistant is too busy right now', AgentRunStatus.QUEUED);
    if (expired.length) await this.broadcastQueuePositions();
    // Unconfirmed writes older than 15 min → EXPIRED (also done lazily on read/confirm).
    await expireStaleAgentActions({}, this.deps.now());
    // Client-executed actions whose lease ran out with no report → UNKNOWN.
    await sweepExpiredAgentClientLeases(this.deps.now());
  }

  private async failRun(
    runId: string,
    code: AgentErrorCode,
    message: string,
    fromStatus: AgentRunStatus = AgentRunStatus.RUNNING,
  ): Promise<void> {
    const updated = await prisma.agentRun.updateMany({
      where: { id: runId, status: fromStatus },
      data: { status: AgentRunStatus.FAILED, errorCode: code, error: message, endedAt: this.deps.now() },
    });
    if (updated.count !== 1) return;
    await this.deps.events.open(runId, { resumed: !(await this.deps.events.has(runId)) });
    await this.emit(runId, { type: 'run.failed', code, message });
    this.lastPositions.delete(runId);
  }

  /** A RUNNING row whose executor is gone (not local, heartbeat stale) → FAILED. */
  private async failIfStale(
    run: Pick<AgentRun, 'id' | 'status' | 'heartbeatAt' | 'startedAt' | 'workerId'>,
    db: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<boolean> {
    if (run.status !== AgentRunStatus.RUNNING || this.active.has(run.id)) return false;
    const last = (run.heartbeatAt ?? run.startedAt)?.getTime() ?? 0;
    if (this.deps.now().getTime() - last < this.deps.config().staleRunMs) return false;
    const updated = await db.agentRun.updateMany({
      where: { id: run.id, status: AgentRunStatus.RUNNING },
      data: {
        status: AgentRunStatus.FAILED,
        errorCode: 'INTERNAL',
        error: 'The run was interrupted',
        endedAt: this.deps.now(),
      },
    });
    if (updated.count === 1 && db === prisma) {
      await this.deps.events.open(run.id, { resumed: !(await this.deps.events.has(run.id)) });
      await this.emit(run.id, { type: 'run.failed', code: 'INTERNAL', message: 'The run was interrupted' });
    }
    return true;
  }

  /** Claims and starts runs while this process has capacity. Coalesces concurrent calls. */
  drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return this.draining;
    }
    this.draining = (async () => {
      try {
        do {
          this.drainAgain = false;
          while (this.active.size < this.deps.config().maxConcurrentRuns) {
            const run = await this.claimNext();
            if (!run) break;
            this.launch(run);
            await this.broadcastQueuePositions();
          }
        } while (this.drainAgain);
      } catch (error) {
        console.error('[agent] queue drain failed', error);
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  private async claimNext(): Promise<AgentRun | null> {
    const agentConfig = this.deps.config();
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AGENT_QUEUE_LOCK_KEY})`;
      const queued = await tx.agentRun.findMany({
        where: { status: AgentRunStatus.QUEUED },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
        select: { id: true, userId: true },
      });
      if (queued.length === 0) return null;
      const running = await tx.agentRun.groupBy({
        by: ['userId'],
        where: { status: AgentRunStatus.RUNNING, userId: { in: [...new Set(queued.map((q) => q.userId))] } },
        _count: { _all: true },
      });
      const runningByUser = new Map(running.map((row) => [row.userId, row._count._all]));
      const pick = queued.find((q) => (runningByUser.get(q.userId) ?? 0) < agentConfig.maxConcurrentRunsPerUser);
      if (!pick) return null;
      const now = this.deps.now();
      return tx.agentRun.update({
        where: { id: pick.id },
        data: { status: AgentRunStatus.RUNNING, startedAt: now, heartbeatAt: now, workerId: this.deps.workerId },
      });
    });
  }

  private launch(run: AgentRun): void {
    const controller = new AbortController();
    const entry: ActiveRun = { controller, userId: run.userId, chatId: run.chatId, done: Promise.resolve() };
    this.active.set(run.id, entry);
    this.lastPositions.delete(run.id);
    entry.done = this.executeRun(run, controller)
      .catch((error) => console.error('[agent] run loop crashed', { runId: run.id, error }))
      .finally(() => {
        this.active.delete(run.id);
        if (!this.stopped) void this.drain();
      });
  }

  /** `run.queued` with the new position for every QUEUED run whose position changed. */
  async broadcastQueuePositions(): Promise<void> {
    const queued = await prisma.agentRun.findMany({
      where: { status: AgentRunStatus.QUEUED },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: POSITION_BROADCAST_LIMIT,
      select: { id: true, chatId: true },
    });
    for (const [index, run] of queued.entries()) {
      const position = index + 1;
      if (this.lastPositions.get(run.id) === position) continue;
      this.lastPositions.set(run.id, position);
      await this.emit(run.id, { type: 'run.queued', runId: run.id, chatId: run.chatId, position });
    }
  }

  /** Resolves when `runId` has left QUEUED/RUNNING (tests, shutdown). */
  async waitForRun(runId: string, timeoutMs = 15_000): Promise<AgentRun> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await this.active.get(runId)?.done;
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
      if (run.status !== AgentRunStatus.QUEUED && run.status !== AgentRunStatus.RUNNING) return run;
      if (Date.now() > deadline) throw new Error(`run ${runId} still ${run.status}`);
      if (!this.stopped || run.status === AgentRunStatus.QUEUED) await this.drain();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  // --- the loop ------------------------------------------------------------------------------

  private async saveMessage(
    runId: string,
    chatId: string,
    role: AgentMessageRole,
    blocks: AgentContentBlock[],
    llmMessages: AgentLlmMessage[] | null,
  ): Promise<void> {
    const message = await appendAgentMessage({ chatId, role, blocks, llmMessages, runId });
    await this.emit(runId, { type: 'message.saved', message: toAgentMessageDto(message) });
  }

  private async executeRun(run: AgentRun, controller: AbortController): Promise<void> {
    const agentConfig = this.deps.config();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), agentConfig.runTimeoutMs);
    timeout.unref?.();
    const heartbeat = setInterval(() => {
      void prisma.agentRun
        .updateMany({ where: { id: run.id, status: AgentRunStatus.RUNNING }, data: { heartbeatAt: this.deps.now() } })
        .then((result) => {
          // Cancelled (or failed) by another process: stop.
          if (result.count === 0 && !signal.aborted) controller.abort('cancelled');
        })
        .catch((error) => console.error('[agent] heartbeat failed', { runId: run.id, error }));
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
    const usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
    let steps = 0;
    /** Text streamed in the current step and not yet saved (persisted on cancel). */
    let unsavedText = '';

    await this.deps.events.open(run.id, { resumed: !(await this.deps.events.has(run.id)) });
    await this.emit(run.id, { type: 'run.started', runId: run.id, chatId: run.chatId });
    try {
      const llm = this.deps.llm();
      if (!llm) throw new AgentLlmError('The AI assistant is not configured');
      const principal = await loadAgentPrincipal(run.userId);
      const context = await buildAgentRunContext({
        principal,
        tools: this.deps.registry.toolsForPrincipal(principal),
        headerLocale: run.locale,
        now: this.deps.now(),
      });
      const history = await prisma.agentMessage.findMany({
        where: { chatId: run.chatId },
        orderBy: { seq: 'asc' },
        select: { role: true, content: true, llmMessages: true, seq: true },
      });
      const isUntrustedTool = (name: string) => this.deps.registry.get(name)?.untrustedContent === true;
      const summary = await this.refreshChatSummary(run, llm, history, isUntrustedTool, usage, signal);
      const messages: AgentLlmMessage[] = [
        { role: 'system', content: context.systemPrompt },
        ...buildAgentModelHistory(history, undefined, summary),
      ];
      const toolCtx: AgentToolContext = {
        principal,
        locale: context.locale,
        timezone: context.timezone,
        now: this.deps.now(),
        runId: run.id,
        chatId: run.chatId,
        clientCaps: run.clientCaps ?? [],
        signal,
        web: createAgentWebRunSession(),
      };
      const openAiTools = this.deps.registry.openAiToolsFor(principal);
      let finalStatus: 'COMPLETED' | 'AWAITING_CONFIRMATION' = 'COMPLETED';
      const provenance = agentMemoryProvenanceFromHistory(history, isUntrustedTool);
      const runState: AgentRunLoopState = {
        tainted: false,
        historyTainted: provenance.historyTainted || Boolean(summary?.tainted),
        userAskedToRemember: userAskedToRemember(provenance.latestUserText),
      };

      for (let step = 1; step <= agentConfig.maxSteps; step += 1) {
        steps = step;
        const lastStep = step === agentConfig.maxSteps;
        const accumulator = new ToolCallAccumulator();
        const stepUsage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
        unsavedText = '';

        const release = await this.llmGate.acquire(signal);
        try {
          const stream = llm.stream({ messages, tools: lastStep ? [] : openAiTools, signal });
          for await (const chunk of stream) {
            if (signal.aborted) break;
            if (chunk.type === 'text') {
              unsavedText += chunk.text;
              await this.emit(run.id, { type: 'text.delta', text: chunk.text });
            } else if (chunk.type === 'tool_call_delta') {
              accumulator.add(chunk);
            } else if (chunk.type === 'usage') {
              stepUsage.inputTokens = chunk.inputTokens;
              stepUsage.outputTokens = chunk.outputTokens;
            }
          }
        } finally {
          release();
        }
        usage.inputTokens += stepUsage.inputTokens;
        usage.outputTokens += stepUsage.outputTokens;
        await this.recordStepUsage(run, llm, messages, unsavedText, stepUsage, steps, usage);
        if (signal.aborted) throw new RunAborted(abortReasonOf(signal));

        const calls = lastStep ? [] : accumulator.calls(run.id, step);
        const text = unsavedText.trim();
        if (calls.length === 0) {
          const finalText = text || 'Sorry, I could not produce an answer. Please try again.';
          unsavedText = '';
          await this.saveMessage(run.id, run.chatId, AgentMessageRole.ASSISTANT, [{ type: 'text', text: finalText }], [
            { role: 'assistant', content: finalText },
          ]);
          break;
        }

        const pendingActionIds = await this.executeToolStep(run, toolCtx, messages, calls, text, signal, runState);
        unsavedText = '';
        if (signal.aborted) throw new RunAborted(abortReasonOf(signal));
        if (pendingActionIds.length > 0) {
          for (const actionId of pendingActionIds) {
            const action = await this.deps.loadPendingAction(actionId);
            if (action) await this.emit(run.id, { type: 'action.pending', action });
          }
          finalStatus = 'AWAITING_CONFIRMATION';
          break;
        }
      }

      const updated = await prisma.agentRun.updateMany({
        where: { id: run.id, status: AgentRunStatus.RUNNING },
        data: {
          status: finalStatus,
          endedAt: this.deps.now(),
          steps,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
      if (updated.count === 1) {
        await this.emit(run.id, { type: 'run.completed', status: finalStatus, usage });
      } else {
        await this.emitCurrentTerminal(run.id);
      }
    } catch (error) {
      await this.finishWithError(run, error, signal, unsavedText, usage, steps);
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }
  }

  /**
   * Phase 11.4 rolling chat summary (`agentChatSummary.service.ts`): returns the summary to
   * replay (stored, or freshly updated when due and the daily budget allows). Its tokens are
   * added to the run's usage. Any failure other than an abort keeps the stored summary.
   */
  private async refreshChatSummary(
    run: AgentRun,
    llm: AgentLlmClient,
    history: HistoryMessage[],
    isUntrustedTool: (name: string) => boolean,
    usage: AgentUsage,
    signal: AbortSignal,
  ): Promise<AgentChatSummaryState | null> {
    const row = await prisma.agentChat.findUnique({
      where: { id: run.chatId },
      select: { summary: true, summaryThroughSeq: true, summaryTainted: true },
    });
    const stored = agentChatSummaryFromRow(row);
    const plan = planAgentChatSummary(history, stored, isUntrustedTool);
    if (!plan) return stored;
    const now = this.deps.now();
    const used = (await agentTokensUsedToday(run.userId, now)) + usage.inputTokens + usage.outputTokens;
    if (this.deps.config().dailyTokenBudget - used < AGENT_CHAT_SUMMARY_BUDGET_RESERVE) return stored;
    const release = await this.llmGate.acquire(signal);
    try {
      const result = await updateAgentChatSummary({ chatId: run.chatId, llm, previous: stored, plan, signal, now });
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      await prisma.agentRun.updateMany({
        where: { id: run.id },
        data: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      });
      void this.deps.logUsage({
        provider: llm.provider,
        model: llm.model,
        reason: LLM_REASON.AGENT_CHAT_SUMMARY,
        userId: run.userId,
        input: JSON.stringify(result.input).slice(0, USAGE_LOG_INPUT_MAX_CHARS),
        output: result.output || '[empty]',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      return result.state ?? stored;
    } catch (error) {
      if (signal.aborted) throw new RunAborted(abortReasonOf(signal));
      console.error('[agent] chat summary failed; using the stored summary', { runId: run.id, error });
      return stored;
    } finally {
      release();
    }
  }

  private async emitCurrentTerminal(runId: string): Promise<void> {
    const current = await prisma.agentRun.findUnique({ where: { id: runId } });
    if (current) await this.emit(runId, terminalEventForRun(current));
  }

  /** One tool step; returns pending action ids created by write tools (auto-approved ones excluded). */
  private async executeToolStep(
    run: AgentRun,
    toolCtx: AgentToolContext,
    messages: AgentLlmMessage[],
    calls: AgentLlmToolCall[],
    text: string,
    signal: AbortSignal,
    runState: AgentRunLoopState,
  ): Promise<string[]> {
    const { registry } = this.deps;
    const assistantLlm: AgentLlmMessage = { role: 'assistant', content: text || null, tool_calls: calls };
    const callBlocks = calls.map((call) => {
      const parsed = parseToolArguments(call.function.arguments);
      return {
        type: 'tool_call' as const,
        callId: call.id,
        name: call.function.name,
        label: registry.labelFor(call.function.name, parsed.ok ? parsed.value : null, toolCtx.locale),
      };
    });
    await this.saveMessage(
      run.id,
      run.chatId,
      AgentMessageRole.ASSISTANT,
      [...(text ? [{ type: 'text' as const, text }] : []), ...callBlocks],
      [assistantLlm],
    );
    messages.push(assistantLlm);

    const toolMessages: AgentLlmMessage[] = [];
    const resultBlocks: AgentContentBlock[] = [];
    const pendingActionIds: string[] = [];
    const autoActionIds: string[] = [];
    const resultActionIds = new Map<string, string>();
    for (const [index, call] of calls.entries()) {
      const { label } = callBlocks[index];
      let execution: AgentToolExecution;
      if (signal.aborted) {
        execution = { ok: false, data: { error: 'cancelled' }, summary: agentT(toolCtx.locale, 'error.cancelled'), label };
      } else {
        await this.emit(run.id, { type: 'tool.started', callId: call.id, name: call.function.name, label });
        const parsed = parseToolArguments(call.function.arguments);
        execution = parsed.ok
          ? await registry.executeTool(
              {
                ...toolCtx,
                callId: call.id,
                memoryProvenance: {
                  untrustedContentInContext: runState.tainted || runState.historyTainted,
                  userAskedToRemember: runState.userAskedToRemember,
                },
              },
              call.function.name,
              parsed.value,
            )
          : {
              ok: false,
              data: { error: 'invalid_arguments', message: 'arguments were not valid JSON' },
              summary: agentT(toolCtx.locale, 'error.invalid'),
              label,
            };
        if (execution.awaitingConfirmation) {
          const auto = await this.deps.autoApprove(registry, execution.awaitingConfirmation.actionId, this.deps.now(), {
            runTainted: runState.tainted,
          });
          if (auto) {
            // Executed (or failed) in this run: the model gets the outcome as this call's
            // result and keeps going; no AWAITING_CONFIRMATION, no follow-up run.
            const { action, closing } = auto;
            autoActionIds.push(action.id);
            execution = {
              ok: closing.status === 'EXECUTED',
              data: {
                status: closing.modelStatus,
                actionId: action.id,
                tool: action.toolName,
                autoApproved: true,
                note: closing.modelNote,
                ...(closing.modelData ?? {}),
              },
              summary: closing.result.message ?? '',
              label,
              ...(closing.result.entities?.length ? { entities: closing.result.entities } : {}),
            };
            resultActionIds.set(call.id, action.id);
          }
        }
        if (execution.ok && registry.get(call.function.name)?.untrustedContent) runState.tainted = true;
        await this.emit(run.id, {
          type: 'tool.finished',
          callId: call.id,
          ok: execution.ok,
          summary: execution.summary,
          ...(execution.entities?.length ? { entities: execution.entities } : {}),
          ...(execution.web ? { web: execution.web } : {}),
          ...(execution.images?.length ? { images: execution.images } : {}),
        });
        // Phase 11: a memory saved without a card → the "Saved to memory · Undo" chip.
        if (execution.ok && execution.memorySaved) {
          await this.emit(run.id, { type: 'memory.saved', callId: call.id, memory: execution.memorySaved });
        }
      }
      toolMessages.push({ role: 'tool', tool_call_id: call.id, content: serializeToolContent(execution) });
      resultBlocks.push({
        type: 'tool_result',
        callId: call.id,
        ok: execution.ok,
        summary: execution.summary,
        ...(execution.entities?.length ? { entities: execution.entities } : {}),
        ...(execution.web ? { web: execution.web } : {}),
        ...(execution.images?.length ? { images: execution.images } : {}),
      });
      if (execution.awaitingConfirmation) {
        pendingActionIds.push(execution.awaitingConfirmation.actionId);
        resultBlocks.push({ type: 'action', actionId: execution.awaitingConfirmation.actionId });
      } else {
        const autoActionId = resultActionIds.get(call.id);
        if (autoActionId) resultBlocks.push({ type: 'action', actionId: autoActionId });
      }
    }
    await this.saveMessage(run.id, run.chatId, AgentMessageRole.TOOL, resultBlocks, toolMessages);
    messages.push(...toolMessages);
    // "Executed automatically" cards: the settled action (`autoApproved: true`).
    for (const actionId of autoActionIds) {
      const action = await this.deps.loadPendingAction(actionId);
      if (action) await this.emit(run.id, { type: 'action.pending', action });
    }
    return pendingActionIds;
  }

  private async recordStepUsage(
    run: AgentRun,
    llm: AgentLlmClient,
    messages: AgentLlmMessage[],
    output: string,
    stepUsage: AgentUsage,
    steps: number,
    total: AgentUsage,
  ): Promise<void> {
    await prisma.agentRun.updateMany({
      where: { id: run.id },
      data: {
        steps,
        inputTokens: total.inputTokens,
        outputTokens: total.outputTokens,
        heartbeatAt: this.deps.now(),
        // The latest call's prompt + reply is what the next turn replays: the chat's context size.
        ...(stepUsage.inputTokens > 0 ? { contextTokens: stepUsage.inputTokens + stepUsage.outputTokens } : {}),
      },
    });
    if (stepUsage.inputTokens === 0 && stepUsage.outputTokens === 0 && !output) return;
    void this.deps.logUsage({
      provider: llm.provider,
      model: llm.model,
      reason: LLM_REASON.AGENT_CHAT,
      userId: run.userId,
      input: JSON.stringify(messages).slice(0, USAGE_LOG_INPUT_MAX_CHARS),
      output: output || '[tool calls]',
      inputTokens: stepUsage.inputTokens,
      outputTokens: stepUsage.outputTokens,
    });
  }

  private async finishWithError(
    run: AgentRun,
    error: unknown,
    signal: AbortSignal,
    unsavedText: string,
    usage: AgentUsage,
    steps: number,
  ): Promise<void> {
    const aborted = error instanceof RunAborted ? error.reason : signal.aborted ? abortReasonOf(signal) : null;
    let status: AgentRunStatus = AgentRunStatus.FAILED;
    let code: AgentErrorCode = 'INTERNAL';
    let message: string | null = 'Something went wrong';
    if (aborted === 'cancelled') {
      status = AgentRunStatus.CANCELLED;
      message = null;
    } else if (aborted === 'timeout') {
      code = 'TIMEOUT';
      message = 'The assistant took too long to answer';
    } else if (error instanceof AgentLlmError) {
      code = 'LLM_ERROR';
      message = 'The AI service is unavailable right now';
      console.error('[agent] LLM error', { runId: run.id, error: error.message });
    } else {
      console.error('[agent] run failed', { runId: run.id, error });
    }

    const partial = unsavedText.trim();
    if (partial) {
      try {
        await this.saveMessage(run.id, run.chatId, AgentMessageRole.ASSISTANT, [{ type: 'text', text: partial }], [
          { role: 'assistant', content: partial },
        ]);
      } catch (saveError) {
        console.error('[agent] could not save partial answer', { runId: run.id, saveError });
      }
    }
    try {
      // RUNNING → final; a row already CANCELLED by another process keeps that status.
      await prisma.agentRun.updateMany({
        where: { id: run.id, status: { in: [AgentRunStatus.RUNNING, AgentRunStatus.CANCELLED] } },
        data: {
          status,
          errorCode: status === AgentRunStatus.FAILED ? code : null,
          error: status === AgentRunStatus.FAILED ? message : null,
          endedAt: this.deps.now(),
          steps,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
    } catch (updateError) {
      console.error('[agent] could not finalize run', { runId: run.id, updateError });
    }
    await this.emitCurrentTerminal(run.id);
  }
}

async function loadPendingActionDto(actionId: string): Promise<AgentPendingActionDto | null> {
  const action = await prisma.agentPendingAction.findUnique({ where: { id: actionId } });
  return action ? toAgentPendingActionDto(action) : null;
}

export function createAgentRunService(overrides: Partial<AgentRunDeps> = {}): AgentRunService {
  return new AgentRunService({
    llm: () => {
      const agentConfig = config.agent;
      return getDefaultAgentLlmClient({
        apiKey: config.deepseek.apiKey,
        baseUrl: agentConfig.baseUrl,
        model: agentConfig.model,
      });
    },
    registry: getAgentToolRegistry(),
    events: getAgentEventStore(),
    config: () => config.agent,
    now: () => new Date(),
    logUsage: logLlmUsage,
    loadPendingAction: loadPendingActionDto,
    autoApprove: autoApproveAgentAction,
    wake: publishAgentQueueWake,
    workerId: defaultAgentWorkerId(defaultWorkerRole),
    ...overrides,
  });
}

let defaultService: AgentRunService | null = null;
let defaultWorkerRole: 'api' | 'worker' = 'api';

/** Call before the first `getAgentRunService()` in `worker.ts` (tags claimed runs). */
export function setAgentWorkerRole(role: 'api' | 'worker'): void {
  defaultWorkerRole = role;
}

export function getAgentRunService(): AgentRunService {
  if (!defaultService) defaultService = createAgentRunService();
  return defaultService;
}
