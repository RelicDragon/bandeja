/**
 * Web tool limits, budget charge and audit.
 *
 * Every search / fetch that reached the cache or the network writes one `LlmUsageLog` row
 * (reason `agent_web_search` / `agent_web_fetch`). The rows are the audit AND the limit
 * store: per user per UTC day (all calls), global per minute (live calls only). They carry
 * no query text (a hash) and no URL path (host only). `inputTokens` is the token-equivalent
 * charge that `agentTokensUsedToday` adds to the daily budget. Postgres, so API and worker
 * processes share it; a small overshoot under concurrent calls is accepted.
 */
import { createHash } from 'node:crypto';
import prisma from '../../../config/database';
import type { AgentWebEnvConfig } from '../../../config/agentWebEnv';
import { LLM_REASON } from '../../ai/llmReasons';
import { agentTokensUsedToday, startOfUtcDay } from '../agentGuards';

export type AgentWebKind = 'search' | 'fetch';

const REASON: Record<AgentWebKind, string> = {
  search: LLM_REASON.AGENT_WEB_SEARCH,
  fetch: LLM_REASON.AGENT_WEB_FETCH,
};

export const AGENT_WEB_MODEL_LIVE = 'live';
export const AGENT_WEB_MODEL_CACHED = 'cached';

/** Audit fingerprint of a query: lets ops spot repeats without storing the words. */
export function hashWebQuery(query: string): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  return `sha256:${createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
}

export async function agentWebCallsToday(userId: string, kind: AgentWebKind, now: Date): Promise<number> {
  return prisma.llmUsageLog.count({
    where: { userId, reason: REASON[kind], createdAt: { gte: startOfUtcDay(now) } },
  });
}

export async function agentWebLiveCallsLastMinute(kind: AgentWebKind, now: Date): Promise<number> {
  return prisma.llmUsageLog.count({
    where: { reason: REASON[kind], model: AGENT_WEB_MODEL_LIVE, createdAt: { gte: new Date(now.getTime() - 60_000) } },
  });
}

export type AgentWebLimitRefusal = 'run_limit' | 'daily_limit' | 'budget_exceeded';

/**
 * Pre-call checks shared by both tools, in order: per run (in-memory session count), per
 * user per day, daily budget. The global per-minute limit is `admitGlobal`, called by the
 * search / fetch service only on a cache miss.
 */
export async function checkAgentWebLimits(params: {
  kind: AgentWebKind;
  userId: string;
  runCount: number;
  env: AgentWebEnvConfig;
  dailyTokenBudget: number;
  now: Date;
}): Promise<AgentWebLimitRefusal | null> {
  const { kind, env } = params;
  const perRun = kind === 'search' ? env.searchPerRun : env.fetchPerRun;
  if (params.runCount >= perRun) return 'run_limit';
  const perDay = kind === 'search' ? env.searchPerUserDay : env.fetchPerUserDay;
  if ((await agentWebCallsToday(params.userId, kind, params.now)) >= perDay) return 'daily_limit';
  if ((await agentTokensUsedToday(params.userId, params.now)) >= params.dailyTokenBudget) return 'budget_exceeded';
  return null;
}

export function admitGlobal(kind: AgentWebKind, env: AgentWebEnvConfig, now: () => Date): () => Promise<boolean> {
  const cap = kind === 'search' ? env.searchGlobalPerMin : env.fetchGlobalPerMin;
  return async () => (await agentWebLiveCallsLastMinute(kind, now())) < cap;
}

/** Writes the audit row (awaited: the next limit / budget check must see it). Never throws. */
export async function recordAgentWebUsage(entry: {
  kind: AgentWebKind;
  userId: string;
  provider: string;
  live: boolean;
  input: string;
  output: Record<string, unknown>;
  charge: number;
  now: Date;
}): Promise<void> {
  try {
    await prisma.llmUsageLog.create({
      data: {
        provider: entry.provider.slice(0, 32),
        model: entry.live ? AGENT_WEB_MODEL_LIVE : AGENT_WEB_MODEL_CACHED,
        reason: REASON[entry.kind],
        userId: entry.userId,
        input: entry.input.slice(0, 300),
        output: JSON.stringify(entry.output).slice(0, 1000),
        inputTokens: Math.max(0, Math.trunc(entry.charge)),
        outputTokens: 0,
        createdAt: entry.now,
      },
    });
  } catch (error) {
    console.error('[agent-web] usage row failed', { kind: entry.kind, error: error instanceof Error ? error.message : 'unknown' });
  }
}
