/**
 * Admin audit of the AI agent (`GET /api/admin/agent/actions|usage`, `requireAdmin`).
 * `AgentPendingAction` is the audit log of every write the agent proposed and what
 * happened to it; `AgentRun` token sums are the usage. Read-only.
 */
import { AgentActionStatus, Prisma } from '@prisma/client';
import prisma from '../../config/database';

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

type UsageRow = { day: string; userId: string; runs: bigint; inputTokens: bigint | null; outputTokens: bigint | null };

/** Daily (UTC) token sums per user from `AgentRun`, newest day first. */
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
           SUM("outputTokens") AS "outputTokens"
    FROM "AgentRun"
    WHERE "createdAt" >= ${since} ${userClause}
    GROUP BY 1, 2
    ORDER BY 1 DESC, 5 DESC`;
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.userId))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  return {
    since: since.toISOString(),
    days,
    rows: rows.map((row) => {
      const inputTokens = Number(row.inputTokens ?? 0);
      const outputTokens = Number(row.outputTokens ?? 0);
      return {
        day: row.day,
        userId: row.userId,
        user: byId.get(row.userId) ?? null,
        runs: Number(row.runs),
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      };
    }),
  };
}
