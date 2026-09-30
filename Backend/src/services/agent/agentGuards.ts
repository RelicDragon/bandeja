/**
 * Agent per-user daily token budget and the `AgentErrorCode` ApiErrors.
 * The agent is always on for every signed-in user.
 */
import type { AgentErrorCode } from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export function agentApiError(statusCode: number, code: AgentErrorCode, message: string): ApiError {
  return new ApiError(statusCode, message, true, { code });
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function agentTokensUsedToday(userId: string, now: Date): Promise<number> {
  const agg = await prisma.agentRun.aggregate({
    where: { userId, createdAt: { gte: startOfUtcDay(now) } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export async function assertAgentBudget(userId: string, dailyTokenBudget: number, now: Date): Promise<void> {
  const used = await agentTokensUsedToday(userId, now);
  if (used >= dailyTokenBudget) {
    throw agentApiError(429, 'BUDGET_EXCEEDED', 'Daily AI assistant limit reached. Try again tomorrow.');
  }
}
