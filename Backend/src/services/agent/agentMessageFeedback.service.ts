/**
 * Thumbs up / down on assistant replies (`PUT /api/agent/chats/:chatId/messages/:messageId/feedback`)
 * and the admin read side (`GET /api/admin/agent/feedback`, daily counts in `/admin/agent/usage`).
 * Only the chat owner rates, only ASSISTANT messages; anything else is 404.
 */
import {
  AgentMessageFeedback as AgentMessageFeedbackDb,
  AgentMessageRole,
  Prisma,
} from '@prisma/client';
import type {
  AgentContentBlock,
  AgentMessageFeedback,
  AgentMessageFeedbackResponse,
} from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { agentMessageFeedbackToDto, textOfBlocks } from './agentChat.service';

export const AGENT_FEEDBACK_ADMIN_LIST_MAX = 200;
const EXCERPT_MAX = 300;

function toDb(rating: AgentMessageFeedback): AgentMessageFeedbackDb {
  return rating === 'up' ? AgentMessageFeedbackDb.UP : AgentMessageFeedbackDb.DOWN;
}

function excerpt(content: Prisma.JsonValue): string {
  const text = textOfBlocks(Array.isArray(content) ? (content as unknown as AgentContentBlock[]) : []);
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text;
}

/** Sets (or with `rating: null` clears) the owner's rating; the comment goes with the rating. */
export async function setAgentMessageFeedback(input: {
  userId: string;
  chatId: string;
  messageId: string;
  rating: AgentMessageFeedback | null;
  comment?: string | null;
  now?: Date;
}): Promise<AgentMessageFeedbackResponse> {
  const comment = input.rating ? input.comment?.trim() || null : null;
  const updated = await prisma.agentMessage.updateMany({
    where: {
      id: input.messageId,
      chatId: input.chatId,
      role: AgentMessageRole.ASSISTANT,
      chat: { userId: input.userId, deletedAt: null },
    },
    data: {
      feedback: input.rating ? toDb(input.rating) : null,
      feedbackComment: comment,
      feedbackAt: input.rating ? (input.now ?? new Date()) : null,
    },
  });
  if (updated.count !== 1) throw new ApiError(404, 'Message not found');
  return { feedback: input.rating };
}

type FeedbackDayRow = { day: string; up: bigint; down: bigint };

/** Ratings per UTC day (by `feedbackAt`) since `since`, newest first; optional chat-owner filter. */
export async function agentFeedbackByDay(since: Date, userId?: string) {
  const userClause = userId
    ? Prisma.sql`AND m."chatId" IN (SELECT id FROM "AgentChat" WHERE "userId" = ${userId})`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<FeedbackDayRow[]>`
    SELECT to_char(m."feedbackAt", 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE m.feedback = 'UP') AS up,
           COUNT(*) FILTER (WHERE m.feedback = 'DOWN') AS down
    FROM "AgentMessage" m
    WHERE m.feedback IS NOT NULL AND m."feedbackAt" >= ${since} ${userClause}
    GROUP BY 1
    ORDER BY 1 DESC`;
  return rows.map((row) => ({ day: row.day, up: Number(row.up), down: Number(row.down) }));
}

/** Newest rated replies (default thumbs-down) with the user message they answered. */
export async function listAgentFeedbackForAdmin(filter: {
  rating: AgentMessageFeedback;
  limit: number;
  userId?: string;
}) {
  const rows = await prisma.agentMessage.findMany({
    where: {
      feedback: toDb(filter.rating),
      ...(filter.userId ? { chat: { userId: filter.userId } } : {}),
    },
    orderBy: { feedbackAt: 'desc' },
    take: Math.min(Math.max(filter.limit, 1), AGENT_FEEDBACK_ADMIN_LIST_MAX),
    select: {
      id: true,
      chatId: true,
      seq: true,
      runId: true,
      content: true,
      feedback: true,
      feedbackComment: true,
      feedbackAt: true,
      createdAt: true,
      chat: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  const previous = await Promise.all(
    rows.map((row) =>
      prisma.agentMessage.findFirst({
        where: { chatId: row.chatId, role: AgentMessageRole.USER, seq: { lt: row.seq } },
        orderBy: { seq: 'desc' },
        select: { content: true },
      }),
    ),
  );
  return rows.map((row, index) => ({
    chatId: row.chatId,
    messageId: row.id,
    runId: row.runId,
    rating: agentMessageFeedbackToDto(row.feedback),
    comment: row.feedbackComment,
    text: excerpt(row.content),
    userText: previous[index] ? excerpt(previous[index].content) : null,
    user: row.chat.user,
    createdAt: row.createdAt.toISOString(),
    feedbackAt: row.feedbackAt?.toISOString() ?? null,
  }));
}
