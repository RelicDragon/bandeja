/**
 * Admin audit of the AI agent (`GET /api/admin/agent/actions|usage|feedback`, `requireAdmin`).
 * `AgentPendingAction` is the audit log of every write the agent proposed and what
 * happened to it; `AgentRun` token sums are the usage, `LlmUsageLog` rows (every agent reason)
 * the estimated cost per day / user / model (`agentCost.ts`). Read-only.
 */
import { AgentActionStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { LLM_REASON } from '../ai/llmReasons';
import { PLATFORM_SETTING_KEYS, getSetting } from '../platformSetting.service';
import { resolveAgentBudgetTiers } from './agentBudget.service';
import { agentCostUsd, agentPriceFor, resolveAgentPriceTable, roundUsd } from './agentCost';
import { AGENT_METERED_USAGE_REASONS } from './agentGuards';
import { agentFeedbackByDay } from './agentMessageFeedback.service';

export const AGENT_AUDIT_ACTIONS_MAX = 200;
export const AGENT_AUDIT_USAGE_MAX_DAYS = 90;

export async function listAgentActionsForAdmin(filter: {
  userId?: string;
  status?: AgentActionStatus;
  limit: number;
}) {
  const rows = await prisma.agentPendingAction.findMany({
    where: {
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(filter.limit, 1), AGENT_AUDIT_ACTIONS_MAX),
    include: { user: { select: { id: true, firstName: true, lastName: true, isAdmin: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    executedAt: row.executedAt?.toISOString() ?? null,
    status: row.status,
    toolName: row.toolName,
    chatId: row.chatId,
    runId: row.runId,
    callId: row.callId,
    args: row.args,
    preview: row.preview,
    result: row.result,
    error: row.error,
    user: row.user,
  }));
}

type UsageRow = {
  day: string;
  userId: string;
  runs: bigint;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cachedInputTokens: bigint | null;
};
type EndReasonRow = { endReason: string | null; runs: bigint; maxSteps: number | null };
type LogRow = {
  day: string;
  userId: string | null;
  model: string;
  reason: string | null;
  calls: bigint;
  inputTokens: bigint | null;
  outputTokens: bigint | null;
  cachedInputTokens: bigint | null;
};

/** Every `LlmUsageLog.reason` the agent writes (chat steps, summary, consolidation, web, voice). */
export const AGENT_USAGE_LOG_REASONS: string[] = Object.values(LLM_REASON).filter((reason) => reason.startsWith('agent_'));

/** Users listed in `costByUser` (most expensive first). */
export const AGENT_AUDIT_COST_USERS_MAX = 50;

type CostSums = { calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; costUsd: number; unpricedCalls: number };

function emptySums(): CostSums {
  return { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0 };
}

function addTo(target: CostSums, row: Omit<CostSums, 'costUsd' | 'unpricedCalls'>, cost: number | null): void {
  target.calls += row.calls;
  target.inputTokens += row.inputTokens;
  target.cachedInputTokens += row.cachedInputTokens;
  target.outputTokens += row.outputTokens;
  if (cost == null) target.unpricedCalls += row.calls;
  else target.costUsd += cost;
}

function nameOnly(user: { id: string; firstName: string | null; lastName: string | null } | undefined) {
  return user ? { id: user.id, firstName: user.firstName, lastName: user.lastName } : null;
}

function sumsOut(sums: CostSums) {
  return { ...sums, costUsd: roundUsd(sums.costUsd) };
}

/**
 * Daily (UTC) token sums per user from `AgentRun`, newest day first, plus run counts by
 * `endReason` over the window (`null` = runs from before the column, or still open).
 */
export async function agentUsageForAdmin(filter: { days: number; userId?: string; now?: Date }) {
  const days = Math.min(Math.max(filter.days, 1), AGENT_AUDIT_USAGE_MAX_DAYS);
  const now = filter.now ?? new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)));
  const userClause = filter.userId ? Prisma.sql`AND "userId" = ${filter.userId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<UsageRow[]>`
    SELECT to_char("createdAt", 'YYYY-MM-DD') AS day,
           "userId",
           COUNT(*) AS runs,
           SUM("inputTokens") AS "inputTokens",
           SUM("outputTokens") AS "outputTokens",
           SUM("cachedInputTokens") AS "cachedInputTokens"
    FROM "AgentRun"
    WHERE "createdAt" >= ${since} ${userClause}
    GROUP BY 1, 2
    ORDER BY 1 DESC, 5 DESC`;
  const endReasons = await prisma.$queryRaw<EndReasonRow[]>`
    SELECT "endReason", COUNT(*) AS runs, MAX(steps) AS "maxSteps"
    FROM "AgentRun"
    WHERE "createdAt" >= ${since} ${userClause}
    GROUP BY 1
    ORDER BY 2 DESC`;
  const logs = await prisma.$queryRaw<LogRow[]>`
    SELECT to_char("createdAt", 'YYYY-MM-DD') AS day,
           "userId",
           model,
           reason,
           COUNT(*) AS calls,
           SUM("inputTokens") AS "inputTokens",
           SUM("outputTokens") AS "outputTokens",
           SUM("cachedInputTokens") AS "cachedInputTokens"
    FROM "LlmUsageLog"
    WHERE "createdAt" >= ${since} AND reason IN (${Prisma.join(AGENT_USAGE_LOG_REASONS)}) ${userClause}
    GROUP BY 1, 2, 3, 4`;
  const [priceSetting, budget] = await Promise.all([
    getSetting(PLATFORM_SETTING_KEYS.AGENT_PRICES_USD_PER_MTOK).catch(() => null),
    resolveAgentBudgetTiers(config.agent),
  ]);
  const prices = resolveAgentPriceTable(priceSetting, config.agent.pricesJson);
  const totals = emptySums();
  const byDay = new Map<string, CostSums & { users: Set<string> }>();
  const byUser = new Map<string, CostSums>();
  const byDayUser = new Map<string, number>();
  const byModel = new Map<string, CostSums & { model: string; reason: string | null; priced: boolean }>();
  for (const log of logs) {
    const sums = {
      calls: Number(log.calls),
      inputTokens: Number(log.inputTokens ?? 0),
      cachedInputTokens: Number(log.cachedInputTokens ?? 0),
      outputTokens: Number(log.outputTokens ?? 0),
    };
    const unitPrice = agentPriceFor(prices.table, log, AGENT_METERED_USAGE_REASONS);
    const cost = agentCostUsd(sums, unitPrice);
    addTo(totals, sums, cost);
    const day = byDay.get(log.day) ?? { ...emptySums(), users: new Set<string>() };
    addTo(day, sums, cost);
    if (log.userId) day.users.add(log.userId);
    byDay.set(log.day, day);
    if (log.userId) {
      const user = byUser.get(log.userId) ?? emptySums();
      addTo(user, sums, cost);
      byUser.set(log.userId, user);
      const key = `${log.day}|${log.userId}`;
      byDayUser.set(key, (byDayUser.get(key) ?? 0) + (cost ?? 0));
    }
    const modelKey = `${log.model}|${log.reason ?? ''}`;
    const model = byModel.get(modelKey) ?? { ...emptySums(), model: log.model, reason: log.reason, priced: unitPrice != null };
    addTo(model, sums, cost);
    byModel.set(modelKey, model);
  }
  const topUsers = [...byUser.entries()]
    .sort((a, b) => b[1].costUsd - a[1].costUsd || b[1].inputTokens - a[1].inputTokens)
    .slice(0, AGENT_AUDIT_COST_USERS_MAX);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set([...rows.map((row) => row.userId), ...topUsers.map(([id]) => id)])] } },
    select: { id: true, firstName: true, lastName: true, isAdmin: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const feedback = await agentFeedbackByDay(since, filter.userId);
  return {
    since: since.toISOString(),
    days,
    /** Daily budgets in force (PlatformSetting rows over env); `overrides` = per-user entries. */
    budget,
    /** Price table the costs below use (USD per 1M tokens) and where it came from. */
    prices,
    /** Estimated cost over the window, from `LlmUsageLog` (all agent reasons). */
    totals: sumsOut(totals),
    costByDay: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, sums]) => {
        const { users: dayUsers, ...rest } = sums;
        return { day, users: dayUsers.size, ...sumsOut(rest) };
      }),
    costByUser: topUsers.map(([userId, sums]) => ({ userId, user: byId.get(userId) ?? null, ...sumsOut(sums) })),
    costByModel: [...byModel.values()]
      .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls)
      .map(({ model, reason, priced, ...sums }) => ({ model, reason, priced, ...sumsOut(sums) })),
    /** Thumbs up / down on assistant replies per UTC day (rating time), newest first. */
    feedback,
    endReasons: endReasons.map((row) => ({
      endReason: row.endReason,
      runs: Number(row.runs),
      maxSteps: row.maxSteps == null ? null : Number(row.maxSteps),
    })),
    rows: rows.map((row) => {
      const inputTokens = Number(row.inputTokens ?? 0);
      const outputTokens = Number(row.outputTokens ?? 0);
      return {
        day: row.day,
        userId: row.userId,
        user: nameOnly(byId.get(row.userId)),
        runs: Number(row.runs),
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        /** Part of `inputTokens` the provider served from its prompt cache (null: not reported). */
        cachedInputTokens: row.cachedInputTokens == null ? null : Number(row.cachedInputTokens),
        /** Estimated USD of that user's agent `LlmUsageLog` rows that day (runs + web + voice). */
        costUsd: roundUsd(byDayUser.get(`${row.day}|${row.userId}`) ?? 0),
      };
    }),
  };
}
