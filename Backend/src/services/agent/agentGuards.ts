/**
 * Agent per-user daily token budget and the `AgentErrorCode` ApiErrors.
 * The agent is always on for every signed-in user.
 */
import type { AgentErrorCode } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { LLM_REASON } from '../ai/llmReasons';
import { agentBudgetResetsAt, startOfUtcDay } from './agentBudgetWindow';
import { resolveAgentDailyBudget, type AgentBudgetConfig, type AgentDailyBudget } from './agentBudget.service';

export { startOfUtcDay };

/**
 * `retryAt`: when a retry can succeed (429 `RATE_LIMITED` quota, `BUDGET_EXCEEDED`). Sent as
 * an ISO `retryAt` in the body; `errorHandler` adds `Retry-After` from it.
 */
export function agentApiError(
  statusCode: number,
  code: AgentErrorCode,
  message: string,
  options: { retryAt?: Date } = {},
): ApiError {
  return new ApiError(statusCode, message, true, {
    code,
    ...(options.retryAt ? { retryAt: options.retryAt.toISOString() } : {}),
  });
}

/** Reasons whose `LlmUsageLog.inputTokens` are web tool charges. */
export const AGENT_WEB_USAGE_REASONS = [LLM_REASON.AGENT_WEB_SEARCH, LLM_REASON.AGENT_WEB_FETCH];

/** Reasons whose `LlmUsageLog.inputTokens` are voice charges (transcription seconds, spoken characters). */
export const AGENT_VOICE_USAGE_REASONS = [LLM_REASON.AGENT_VOICE_TRANSCRIPTION, LLM_REASON.AGENT_VOICE_SPEECH];

/** Every token-equivalent charge row that counts toward the daily budget. */
export const AGENT_METERED_USAGE_REASONS = [...AGENT_WEB_USAGE_REASONS, ...AGENT_VOICE_USAGE_REASONS];

/**
 * Today's (UTC) budget use: LLM tokens of the user's runs plus the token-equivalents charged
 * for live web searches / page fetches (Phase 13) and voice (transcription, speech). Prompt
 * tokens served from the provider's cache (`AgentRun.cachedInputTokens`, part of `inputTokens`)
 * count at `AGENT_CACHED_TOKEN_WEIGHT` (default 0.1, about DeepSeek's cache-hit price ratio).
 */
export async function agentTokensUsedToday(
  userId: string,
  now: Date,
  cachedTokenWeight = config.agent.cachedTokenWeight,
): Promise<number> {
  const since = startOfUtcDay(now);
  const [runs, metered] = await Promise.all([
    prisma.agentRun.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true, cachedInputTokens: true },
    }),
    prisma.llmUsageLog.aggregate({
      where: { userId, reason: { in: AGENT_METERED_USAGE_REASONS }, createdAt: { gte: since } },
      _sum: { inputTokens: true },
    }),
  ]);
  const input = runs._sum.inputTokens ?? 0;
  const cached = Math.min(input, runs._sum.cachedInputTokens ?? 0);
  const weightedInput = input - cached + Math.ceil(cached * cachedTokenWeight);
  return weightedInput + (runs._sum.outputTokens ?? 0) + (metered._sum.inputTokens ?? 0);
}

/** Today's use against the user's own budget (`agentBudget.service.ts`: override, admin or user tier). */
export async function agentBudgetStatus(
  userId: string,
  base: AgentBudgetConfig,
  now: Date,
  options: { isAdmin?: boolean } = {},
): Promise<{ used: number; budget: AgentDailyBudget; remaining: number }> {
  const [used, budget] = await Promise.all([
    agentTokensUsedToday(userId, now),
    resolveAgentDailyBudget(userId, base, options),
  ]);
  return { used, budget, remaining: Math.max(0, budget.tokens - used) };
}

/** 429 `BUDGET_EXCEEDED` with `retryAt` = next UTC midnight when the user's budget is used up. */
export async function assertAgentBudget(
  userId: string,
  base: AgentBudgetConfig,
  now: Date,
  options: { isAdmin?: boolean } = {},
): Promise<void> {
  const { remaining } = await agentBudgetStatus(userId, base, now, options);
  if (remaining <= 0) {
    throw agentApiError(429, 'BUDGET_EXCEEDED', 'Daily AI assistant limit reached. Try again tomorrow.', {
      retryAt: agentBudgetResetsAt(now),
    });
  }
}
