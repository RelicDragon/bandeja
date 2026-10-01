/**
 * AI agent env (docs/domains/agent.md). Resolved live from `process.env` through
 * `config.agent` so tests see the current values. The agent is always on for every user.
 */

export type AgentEnvConfig = {
  model: string;
  baseUrl: string;
  /** input + output tokens per user per UTC day, summed from `AgentRun`. */
  dailyTokenBudget: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  maxSteps: number;
  runTimeoutMs: number;
  /** Runs executing at once in one process. */
  maxConcurrentRuns: number;
  /** Runs executing at once per user (all processes; enforced at claim). */
  maxConcurrentRunsPerUser: number;
  /** QUEUED runs per user; more → 429 `RATE_LIMITED`. */
  maxQueuedRunsPerUser: number;
  /** Outbound LLM requests in flight at once in one process. */
  maxConcurrentLlmCalls: number;
  queuePollIntervalMs: number;
  /** A run QUEUED longer than this fails with `TIMEOUT`. */
  queueMaxWaitMs: number;
  /** A RUNNING run whose heartbeat is older than this is failed (`INTERNAL`) by the sweep. */
  staleRunMs: number;
  /** Phase 11.4: LLM calls the weekly memory consolidation may make per UTC day (all users). 0 = deterministic dedupe only. */
  memoryConsolidationDailyCap: number;
};

export const AGENT_DEFAULT_MODEL = 'deepseek-flash';
export const AGENT_DEFAULT_BASE_URL = 'https://api.deepseek.com';

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function resolveAgentEnvConfig(env: NodeJS.ProcessEnv): AgentEnvConfig {
  return {
    model: (env.AGENT_MODEL || '').trim() || AGENT_DEFAULT_MODEL,
    baseUrl: ((env.AGENT_BASE_URL || '').trim() || AGENT_DEFAULT_BASE_URL).replace(/\/$/, ''),
    dailyTokenBudget: intInRange(env.AGENT_DAILY_TOKEN_BUDGET, 300_000, 0, 100_000_000),
    rateLimitMax: intInRange(env.AGENT_RATE_LIMIT_MAX, 30, 1, 10_000),
    rateLimitWindowMs: intInRange(env.AGENT_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000, 1000, 24 * 60 * 60 * 1000),
    maxSteps: intInRange(env.AGENT_MAX_STEPS, 8, 1, 20),
    runTimeoutMs: intInRange(env.AGENT_RUN_TIMEOUT_MS, 60_000, 5_000, 10 * 60 * 1000),
    maxConcurrentRuns: intInRange(env.AGENT_MAX_CONCURRENT_RUNS, 4, 1, 100),
    maxConcurrentRunsPerUser: intInRange(env.AGENT_MAX_CONCURRENT_RUNS_PER_USER, 1, 1, 20),
    maxQueuedRunsPerUser: intInRange(env.AGENT_MAX_QUEUED_RUNS_PER_USER, 3, 1, 50),
    maxConcurrentLlmCalls: intInRange(env.AGENT_MAX_CONCURRENT_LLM_CALLS, 4, 1, 100),
    queuePollIntervalMs: intInRange(env.AGENT_QUEUE_POLL_INTERVAL_MS, 1000, 100, 60_000),
    queueMaxWaitMs: intInRange(env.AGENT_QUEUE_MAX_WAIT_MS, 10 * 60 * 1000, 10_000, 24 * 60 * 60 * 1000),
    staleRunMs: intInRange(env.AGENT_STALE_RUN_MS, 30_000, 10_000, 60 * 60 * 1000),
    memoryConsolidationDailyCap: intInRange(env.AGENT_MEMORY_CONSOLIDATION_DAILY_CAP, 200, 0, 100_000),
  };
}
