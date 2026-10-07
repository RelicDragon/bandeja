/**
 * Agent chats and messages: ownership-scoped reads/writes and wire DTOs
 * (`Frontend/shared/agentContract.ts`). Every lookup is `where: { id, userId }`, so
 * another user's chat id is a plain 404.
 */
import {
  AgentActionStatus,
  AgentMessageFeedback as AgentMessageFeedbackDb,
  AgentMessageRole,
  AgentRunStatus,
  Prisma,
  type AgentMessage,
} from '@prisma/client';
import type {
  AgentActionPreview,
  AgentActionResult,
  AgentChatDetailDto,
  AgentChatDto,
  AgentChatUsageDto,
  AgentContentBlock,
  AgentMessageDto,
  AgentMessageFeedback,
  AgentPendingActionDto,
  AgentRunSummaryDto,
  AgentActionExecution,
  AgentToolRiskTier,
} from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import type { AgentLlmMessage } from './llm/deepseekStream';
import { agentBudgetStatus } from './agentGuards';
import { agentBudgetRetryAt } from './agentBudgetWindow';

export const AGENT_CHAT_TITLE_MAX = 60;
const PREVIEW_MAX = 140;
const CHAT_LIST_LIMIT = 100;
const CHAT_DETAIL_MESSAGE_LIMIT = 300;
/** `activeRun` on chat DTOs: the client re-attaches to these on return. */
const ACTIVE_RUN_STATUSES: AgentRunStatus[] = [
  AgentRunStatus.QUEUED,
  AgentRunStatus.RUNNING,
  AgentRunStatus.AWAITING_CONFIRMATION,
];

export function agentChatNotFound(): ApiError {
  return new ApiError(404, 'Chat not found');
}

function blocksOf(message: Pick<AgentMessage, 'content'>): AgentContentBlock[] {
  return Array.isArray(message.content) ? (message.content as unknown as AgentContentBlock[]) : [];
}

export function textOfBlocks(blocks: AgentContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<AgentContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export function toAgentMessageDto(message: AgentMessage): AgentMessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    seq: message.seq,
    role: message.role,
    blocks: blocksOf(message),
    runId: message.runId,
    createdAt: message.createdAt.toISOString(),
    ...(message.role === AgentMessageRole.ASSISTANT ? { feedback: agentMessageFeedbackToDto(message.feedback) } : {}),
  };
}

export function agentMessageFeedbackToDto(feedback: AgentMessage['feedback']): AgentMessageFeedback | null {
  if (feedback === AgentMessageFeedbackDb.UP) return 'up';
  if (feedback === AgentMessageFeedbackDb.DOWN) return 'down';
  return null;
}

type PendingActionRow = Prisma.AgentPendingActionGetPayload<object>;

/** `args.riskTier` written at propose (`agentActionOutcome.readStoredActionArgs` reads it the same way). */
function storedRiskTier(args: Prisma.JsonValue): AgentToolRiskTier {
  const value = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  return value.riskTier === 'standard' ? 'standard' : 'critical';
}

/** Client-executed when the stored plan says `executor: 'client'` (booking plan §14.5); else server. */
function storedExecution(args: Prisma.JsonValue): AgentActionExecution {
  const value = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const plan = value.plan && typeof value.plan === 'object' ? (value.plan as Record<string, unknown>) : {};
  return plan.executor === 'client' ? 'client' : 'server';
}

export function toAgentPendingActionDto(action: PendingActionRow): AgentPendingActionDto {
  const riskTier = storedRiskTier(action.args);
  return {
    id: action.id,
    chatId: action.chatId,
    runId: action.runId,
    toolName: action.toolName,
    status: action.status,
    preview: action.preview as unknown as AgentActionPreview,
    expiresAt: action.expiresAt.toISOString(),
    result: (action.result as unknown as AgentActionResult | null) ?? null,
    createdAt: action.createdAt.toISOString(),
    autoApproved: action.autoApproved,
    riskTier,
    canAlwaysAllow: riskTier === 'standard',
    execution: storedExecution(action.args),
  };
}

function previewOf(messages: Pick<AgentMessage, 'content' | 'role'>[]): string | null {
  for (const message of messages) {
    if (message.role === AgentMessageRole.TOOL) continue;
    const text = textOfBlocks(blocksOf(message));
    if (text) return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
  }
  return null;
}

const CHAT_LIST_INCLUDE = {
  messages: { orderBy: { seq: 'desc' }, take: 4, select: { content: true, role: true } },
  runs: {
    where: { status: { in: ACTIVE_RUN_STATUSES } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true },
  },
} satisfies Prisma.AgentChatInclude;

type ChatListRow = Prisma.AgentChatGetPayload<{ include: typeof CHAT_LIST_INCLUDE }>;

function toAgentChatDto(chat: ChatListRow): AgentChatDto {
  const run = chat.runs[0];
  const activeRun: AgentRunSummaryDto | null = run ? { id: run.id, status: run.status } : null;
  return {
    id: chat.id,
    title: chat.title,
    lastMessagePreview: previewOf(chat.messages),
    activeRun,
    pinnedAt: chat.pinnedAt?.toISOString() ?? null,
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

/** `archived`: the Archived list instead of the main one. Deleted chats are never listed. */
export async function listAgentChats(userId: string, opts: { archived?: boolean } = {}): Promise<AgentChatDto[]> {
  const chats = await prisma.agentChat.findMany({
    where: { userId, deletedAt: null, archivedAt: opts.archived ? { not: null } : null },
    // Pinned first (most recently pinned on top), then the rest by last activity.
    orderBy: [{ pinnedAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: CHAT_LIST_LIMIT,
    include: CHAT_LIST_INCLUDE,
  });
  return chats.map(toAgentChatDto);
}

export function countArchivedAgentChats(userId: string): Promise<number> {
  return prisma.agentChat.count({ where: { userId, deletedAt: null, archivedAt: { not: null } } });
}

export async function createAgentChat(userId: string): Promise<AgentChatDto> {
  const chat = await prisma.agentChat.create({ data: { userId }, include: CHAT_LIST_INCLUDE });
  return toAgentChatDto(chat);
}

/**
 * The app's "New chat" (`POST /agent/chats`): reuses the newest untouched chat (no messages,
 * no runs, untitled, not pinned / archived), so opening New chat and backing out never piles
 * up empty rows. Bumped to the top of the list.
 */
export async function startAgentChat(userId: string): Promise<AgentChatDto> {
  const empty = await prisma.agentChat.findFirst({
    where: {
      userId,
      deletedAt: null,
      archivedAt: null,
      pinnedAt: null,
      title: null,
      messages: { none: {} },
      runs: { none: {} },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  if (!empty) return createAgentChat(userId);
  const chat = await prisma.agentChat.update({
    where: { id: empty.id },
    data: { updatedAt: new Date() },
    include: CHAT_LIST_INCLUDE,
  });
  return toAgentChatDto(chat);
}

/** Owner-scoped, non-deleted chat (archived included) or 404. */
export async function requireOwnedAgentChat(userId: string, chatId: string) {
  const chat = await prisma.agentChat.findFirst({ where: { id: chatId, userId, deletedAt: null } });
  if (!chat) throw agentChatNotFound();
  return chat;
}

export async function getAgentChatDetail(userId: string, chatId: string): Promise<AgentChatDetailDto> {
  const chat = await prisma.agentChat.findFirst({
    where: { id: chatId, userId, deletedAt: null },
    include: CHAT_LIST_INCLUDE,
  });
  if (!chat) throw agentChatNotFound();
  const [messagesDesc, actions, usage] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { chatId },
      orderBy: { seq: 'desc' },
      take: CHAT_DETAIL_MESSAGE_LIMIT,
    }),
    prisma.agentPendingAction.findMany({ where: { chatId, userId }, orderBy: { createdAt: 'asc' } }),
    getAgentChatUsage(userId, chatId),
  ]);
  return {
    ...toAgentChatDto(chat),
    messages: messagesDesc.reverse().map(toAgentMessageDto),
    actions: actions.map(toAgentPendingActionDto),
    usage,
  };
}

/** Context = the latest run that reached the model; daily = the budget `assertAgentBudget` enforces. */
export async function getAgentChatUsage(userId: string, chatId: string, now = new Date()): Promise<AgentChatUsageDto> {
  const agentConfig = config.agent;
  const [lastRun, daily] = await Promise.all([
    prisma.agentRun.findFirst({
      where: { chatId, userId, contextTokens: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      select: { contextTokens: true },
    }),
    agentBudgetStatus(userId, agentConfig, now),
  ]);
  return {
    contextTokens: lastRun?.contextTokens ?? 0,
    contextWindowTokens: agentConfig.contextWindowTokens,
    dailyUsedTokens: daily.used,
    // The user's own budget (per-user override, admin or user tier), not the global default.
    dailyBudgetTokens: daily.budget.tokens,
    dailyResetsAt: agentBudgetRetryAt(now),
  };
}

/**
 * The PATCH route: rename, pin and/or archive. Pin and archive alone keep `updatedAt` (the row's
 * time and order). Archive cancels nothing; pending confirmations stay usable in the chat.
 */
export async function updateAgentChat(
  userId: string,
  chatId: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean },
): Promise<AgentChatDto> {
  const current = await requireOwnedAgentChat(userId, chatId);
  const data: Prisma.AgentChatUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title.trim().slice(0, AGENT_CHAT_TITLE_MAX) || null;
  if (patch.pinned !== undefined && patch.pinned !== (current.pinnedAt != null)) {
    data.pinnedAt = patch.pinned ? new Date() : null;
  }
  if (patch.archived !== undefined && patch.archived !== (current.archivedAt != null)) {
    data.archivedAt = patch.archived ? new Date() : null;
  }
  if (patch.title === undefined) data.updatedAt = current.updatedAt;
  const chat = await prisma.agentChat.update({ where: { id: chatId }, data, include: CHAT_LIST_INCLUDE });
  return toAgentChatDto(chat);
}

/**
 * The DELETE route. `delete`: a soft delete — the chat disappears from the app and the Telegram
 * assistant but its rows stay on the server. `archive`: what store builds mean by DELETE (their
 * only list action was "Archive chat"). Cancels nothing by itself; the route cancels a live run
 * first.
 */
export async function removeAgentChat(userId: string, chatId: string, mode: 'delete' | 'archive'): Promise<void> {
  await requireOwnedAgentChat(userId, chatId);
  const now = new Date();
  await prisma.agentChat.update({
    where: { id: chatId },
    data: mode === 'delete' ? { deletedAt: now, pinnedAt: null } : { archivedAt: now },
  });
  await prisma.agentPendingAction.updateMany({
    where: { chatId, userId, status: AgentActionStatus.PENDING },
    data: { status: AgentActionStatus.EXPIRED },
  });
}

/**
 * `[slot:<ref>]` / `[booking:<ref>]` tokens the app's slot and booking cards append to a user
 * message (docs/domains/agent.md "Ref tokens in user messages"). Machine refs, never shown.
 */
const AGENT_REF_TOKEN_RE = /\[(slot|booking):([^\]\s]{1,512})\]/g;

export function stripAgentRefTokens(text: string): string {
  return text.replace(AGENT_REF_TOKEN_RE, ' ');
}

/** Chat title from the first user message, without ref tokens ('' when nothing else is left). */
export function autoTitleFromText(text: string): string {
  const oneLine = stripAgentRefTokens(text).replace(/\s+/g, ' ').trim();
  if (oneLine.length <= AGENT_CHAT_TITLE_MAX) return oneLine;
  const cut = oneLine.slice(0, AGENT_CHAT_TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Edit a user message (the HTTP send with `editMessageId`): delete it and every later message,
 * drop a rolling summary that covered any of them, and re-derive an auto title that came from
 * the edited text. Caller holds the chat row lock. Returns the title to keep (null = re-title
 * from the new text).
 */
export async function rewindAgentChatToMessage(
  tx: Prisma.TransactionClient,
  chatId: string,
  messageId: string,
  title: string | null,
): Promise<string | null> {
  const target = await tx.agentMessage.findFirst({
    where: { id: messageId, chatId, role: AgentMessageRole.USER },
    select: { seq: true, content: true },
  });
  if (!target) {
    throw new ApiError(404, 'Message not found', true, { code: 'validation.invalidInput' });
  }
  const earlierUser = await tx.agentMessage.count({
    where: { chatId, role: AgentMessageRole.USER, seq: { lt: target.seq } },
  });
  await tx.agentMessage.deleteMany({ where: { chatId, seq: { gte: target.seq } } });
  await tx.agentChat.updateMany({
    where: { id: chatId, summaryThroughSeq: { gte: target.seq } },
    data: { summary: null, summaryThroughSeq: null, summaryTainted: false, summaryUpdatedAt: null },
  });
  const oldText = textOfBlocks(blocksOf(target));
  if (earlierUser === 0 && title && title === autoTitleFromText(oldText)) return null;
  return title;
}

export type AppendAgentMessageInput = {
  chatId: string;
  role: AgentMessageRole;
  blocks: AgentContentBlock[];
  /** Private model replay payload (assistant tool_calls, tool results). */
  llmMessages?: AgentLlmMessage[] | null;
  runId?: string | null;
};

/**
 * Appends with the next `seq`. Only one run writes a chat at a time (CHAT_BUSY), so a
 * unique clash is rare; retry a couple of times instead of locking.
 */
export async function appendAgentMessage(
  input: AppendAgentMessageInput,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<AgentMessage> {
  for (let attempt = 0; ; attempt += 1) {
    const last = await db.agentMessage.findFirst({
      where: { chatId: input.chatId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    try {
      const message = await db.agentMessage.create({
        data: {
          chatId: input.chatId,
          seq: (last?.seq ?? 0) + 1,
          role: input.role,
          content: input.blocks as unknown as Prisma.InputJsonValue,
          llmMessages: input.llmMessages
            ? (input.llmMessages as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          runId: input.runId ?? null,
        },
      });
      await db.agentChat.update({ where: { id: input.chatId }, data: { updatedAt: new Date() } });
      return message;
    } catch (error) {
      const isSeqClash =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 3;
      if (!isSeqClash) throw error;
    }
  }
}
