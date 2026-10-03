/**
 * AI agent env (docs/domains/agent.md). Resolved live from `process.env` through
 * `config.agent` so tests see the current values. The agent is always on for every user.
 */

export type AgentEnvConfig = {
  model: string;
  baseUrl: string;
  /** input + output tokens per user per UTC day, summed from `AgentRun`. */
  dailyTokenBudget: number;
  /** Context size the chat meter measures against (the in-chat "start a new chat" hint). */
  contextWindowTokens: number;
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
  /**
   * Tool groups (`tools/toolGroups.ts`): send only `core` + loaded groups + `load_tools` per
   * step instead of the whole catalogue. False = every tool the principal may use, every step.
   */
  toolGroupsEnabled: boolean;
  /**
   * Model tried once when the primary's retries are exhausted (or at once on a 404 model-not-found).
   * Null = no fallback.
   */
  fallbackModel: string | null;
  /** `max_tokens` sent on every agent model call (one step's reply). */
  maxOutputTokens: number;
  /** Retries of one step's model call on 429 / 5xx / network errors, only before anything streamed. */
  llmMaxRetries: number;
  /** First retry delay; doubles per retry, jittered (a `retry-after` header wins, capped). */
  llmRetryBaseMs: number;
  /** Per-call deadline of a tool's handler (reads and write proposals); a tool's `timeoutMs` overrides it. */
  toolTimeoutMs: number;
  /** Weight of prompt-cache hit tokens in the daily budget (`agentTokensUsedToday`); 1 = full price. */
  cachedTokenWeight: number;
};

export const AGENT_DEFAULT_MODEL = 'deepseek-flash';
export const AGENT_DEFAULT_BASE_URL = 'https://api.deepseek.com';

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function ratio(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

export function resolveAgentEnvConfig(env: NodeJS.ProcessEnv): AgentEnvConfig {
  return {
    model: (env.AGENT_MODEL || '').trim() || AGENT_DEFAULT_MODEL,
    baseUrl: ((env.AGENT_BASE_URL || '').trim() || AGENT_DEFAULT_BASE_URL).replace(/\/$/, ''),
    dailyTokenBudget: intInRange(env.AGENT_DAILY_TOKEN_BUDGET, 1_500_000, 0, 100_000_000),
    contextWindowTokens: intInRange(env.AGENT_CONTEXT_WINDOW_TOKENS, 128_000, 1_000, 10_000_000),
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
    toolGroupsEnabled: flag(env.AGENT_TOOL_GROUPS_ENABLED, true),
    fallbackModel: (env.AGENT_FALLBACK_MODEL || '').trim() || null,
    // DeepSeek's chat models allow up to 8k output tokens; an agent step rarely needs half of that.
    maxOutputTokens: intInRange(env.AGENT_MAX_OUTPUT_TOKENS, 4096, 256, 65_536),
    llmMaxRetries: intInRange(env.AGENT_LLM_MAX_RETRIES, 2, 0, 5),
    llmRetryBaseMs: intInRange(env.AGENT_LLM_RETRY_BASE_MS, 500, 0, 10_000),
    toolTimeoutMs: intInRange(env.AGENT_TOOL_TIMEOUT_MS, 15_000, 1_000, 120_000),
    cachedTokenWeight: ratio(env.AGENT_CACHED_TOKEN_WEIGHT, 0.1),
  };
}
