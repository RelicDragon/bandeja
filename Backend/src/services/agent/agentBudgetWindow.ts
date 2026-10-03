/**
 * The agent's daily token budget window (`agentTokensUsedToday`): the UTC calendar day, the
 * same for every user. `retryAt` on 429 `BUDGET_EXCEEDED` (REST body, `Retry-After`, and the
 * `run.failed` SSE event) and `AgentChatUsageDto.dailyResetsAt` are the next UTC midnight.
 */

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Next UTC midnight: when today's budget use stops counting. */
export function agentBudgetResetsAt(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** ISO `retryAt` for a `BUDGET_EXCEEDED` error or `run.failed` event. */
export function agentBudgetRetryAt(now: Date = new Date()): string {
  return agentBudgetResetsAt(now).toISOString();
}
