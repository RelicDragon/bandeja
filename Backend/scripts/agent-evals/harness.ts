/**
 * Drives the REAL agent run loop (`createAgentRunService` with the default registry, context
 * builder and DeepSeek client) for one eval case:
 *
 *   createAgentChat → (history rows) → enqueueRun → claim this run → launch → wait
 *
 * Only these deps are overridden: the LLM client is wrapped (records each call: offered
 * tools, latency, emitted tool calls, the prompt as an id corpus), the event store is in
 * memory, usage logs are captured instead of written, wake is a no-op, and the per-user
 * caps / daily budget are lifted so one eval user can run cases in parallel.
 *
 * Seam note: `AgentRunService` has no public "execute this run id" entry; `drain()` claims
 * the oldest QUEUED run of ANY user (it would steal runs of tests or dev servers sharing the
 * DB). So the harness claims its own run with a conditional update and calls the private
 * `launch(run)`. A public `executeClaimedRun(runId)` (or `drain({ runIds })`) would remove that.
 */
import os from 'node:os';
import { AgentMessageRole, AgentRunStatus, type AgentRun } from '@prisma/client';
import prisma from '../../src/config/database';
import { config } from '../../src/config/env';
import { appendAgentMessage, createAgentChat } from '../../src/services/agent/agentChat.service';
import { InMemoryAgentEventStore } from '../../src/services/agent/agentEvents';
import { createAgentRunService, type AgentRunService } from '../../src/services/agent/agentRun.service';
import {
  getDefaultAgentLlmClient,
  ToolCallAccumulator,
  type AgentLlmClient,
  type AgentLlmMessage,
  type AgentLlmStreamChunk,
  type AgentLlmStreamParams,
} from '../../src/services/agent/llm/deepseekStream';
import { evalScope, type EvalCaseScope } from './stubs';

export type LlmCallRecord = {
  startedAt: number;
  ttftMs: number | null;
  durationMs: number;
  toolsOffered: string[];
  messageCount: number;
  systemPromptChars: number;
  /** system + user + tool content of the prompt (assistant turns excluded): where ids may come from. */
  corpus: string;
  toolCalls: { name: string; arguments: string }[];
  usage: Record<string, unknown> | null;
  finish: string | null;
  textChars: number;
  error: string | null;
};

export type HarnessScope = EvalCaseScope & { llmCalls: LlmCallRecord[]; usageLog: unknown[] };

export class ForeignClaimError extends Error {
  constructor(runId: string) {
    super(`run ${runId} was claimed by another worker (is a dev server polling this DB?)`);
  }
}

function corpusOf(messages: AgentLlmMessage[]): string {
  return messages
    .filter((m) => m.role !== 'assistant')
    .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    .join('\n');
}

class RecordingLlm implements AgentLlmClient {
  constructor(private readonly inner: AgentLlmClient) {}
  get provider() {
    return this.inner.provider;
  }
  get model() {
    return this.inner.model;
  }
  stream(params: AgentLlmStreamParams): AsyncIterable<AgentLlmStreamChunk> {
    const inner = this.inner;
    const scope = evalScope.getStore() as HarnessScope | undefined;
    const system = params.messages.find((m) => m.role === 'system');
    const record: LlmCallRecord = {
      startedAt: Date.now(),
      ttftMs: null,
      durationMs: 0,
      toolsOffered: (params.tools ?? []).map((t) => t.function.name),
      messageCount: params.messages.length,
      systemPromptChars: typeof system?.content === 'string' ? system.content.length : 0,
      corpus: corpusOf(params.messages),
      toolCalls: [],
      usage: null,
      finish: null,
      textChars: 0,
      error: null,
    };
    scope?.llmCalls.push(record);
    return (async function* () {
      const acc = new ToolCallAccumulator();
      try {
        for await (const chunk of inner.stream(params)) {
          if (record.ttftMs === null && (chunk.type === 'text' || chunk.type === 'tool_call_delta')) {
            record.ttftMs = Date.now() - record.startedAt;
          }
          if (chunk.type === 'text') record.textChars += chunk.text.length;
          else if (chunk.type === 'tool_call_delta') acc.add(chunk);
          else if (chunk.type === 'usage') record.usage = { ...chunk };
          else if (chunk.type === 'finish') record.finish = chunk.reason;
          yield chunk;
        }
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        record.durationMs = Date.now() - record.startedAt;
        record.toolCalls = acc.calls('eval', 0).map((c) => ({ name: c.function.name, arguments: c.function.arguments }));
      }
    })();
  }
}

export type EvalHarness = {
  service: AgentRunService;
  model: string;
  workerId: string;
  runTimeoutMs: number;
  maxSteps: number;
  createChat: (userId: string) => Promise<string>;
  seedHistory: (chatId: string, turns: { user: string; assistant: string }[]) => Promise<void>;
  runTurn: (input: { userId: string; chatId: string; text: string; appLocale: string }) => Promise<AgentRun>;
};

export function createEvalHarness(options: { concurrency: number }): EvalHarness {
  const agentConfig = config.agent;
  const inner = getDefaultAgentLlmClient({
    apiKey: config.deepseek.apiKey,
    baseUrl: agentConfig.baseUrl,
    model: agentConfig.model,
  });
  if (!inner) throw new Error('DEEPSEEK_API_KEY is not set (Backend/.env): the eval needs the real model');
  const llm = new RecordingLlm(inner);
  const workerId = `agent-eval:${os.hostname()}:${process.pid}`.slice(0, 96);
  const service = createAgentRunService({
    llm: () => llm,
    events: new InMemoryAgentEventStore(),
    config: () => {
      const live = config.agent;
      return {
        ...live,
        dailyTokenBudget: Number.MAX_SAFE_INTEGER,
        maxQueuedRunsPerUser: 1000,
        maxConcurrentRunsPerUser: 1000,
        maxConcurrentRuns: 1000,
        maxConcurrentLlmCalls: Math.max(live.maxConcurrentLlmCalls, options.concurrency),
      };
    },
    logUsage: async (entry) => {
      (evalScope.getStore() as HarnessScope | undefined)?.usageLog.push(entry);
    },
    wake: async () => {},
    workerId,
  });

  const launch = (service as unknown as { launch?: (run: AgentRun) => void }).launch;
  if (typeof launch !== 'function') {
    throw new Error('AgentRunService.launch(run) not found: the eval harness seam changed (see harness.ts header)');
  }

  return {
    service,
    model: inner.model,
    workerId,
    runTimeoutMs: agentConfig.runTimeoutMs,
    maxSteps: agentConfig.maxSteps,
    createChat: async (userId) => (await createAgentChat(userId)).id,
    seedHistory: async (chatId, turns) => {
      for (const turn of turns) {
        await appendAgentMessage({ chatId, role: AgentMessageRole.USER, blocks: [{ type: 'text', text: turn.user }] });
        await appendAgentMessage({
          chatId,
          role: AgentMessageRole.ASSISTANT,
          blocks: [{ type: 'text', text: turn.assistant }],
          llmMessages: [{ role: 'assistant', content: turn.assistant }],
        });
      }
    },
    runTurn: async ({ userId, chatId, text, appLocale }) => {
      const { runId } = await service.enqueueRun({ userId, chatId, text, headerLocale: appLocale });
      const now = new Date();
      const claimed = await prisma.agentRun.updateMany({
        where: { id: runId, status: AgentRunStatus.QUEUED },
        data: { status: AgentRunStatus.RUNNING, startedAt: now, heartbeatAt: now, workerId },
      });
      if (claimed.count !== 1) throw new ForeignClaimError(runId);
      const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
      launch.call(service, run);
      const deadline = Date.now() + agentConfig.runTimeoutMs + 30_000;
      while (service.isActive(runId)) {
        if (Date.now() > deadline) throw new Error(`run ${runId} did not finish`);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
    },
  };
}
