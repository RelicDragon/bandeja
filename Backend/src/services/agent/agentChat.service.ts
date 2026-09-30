/**
 * Agent chats and messages: ownership-scoped reads/writes and wire DTOs
 * (`Frontend/shared/agentContract.ts`). Every lookup is `where: { id, userId }`, so
 * another user's chat id is a plain 404.
 */
import { AgentActionStatus, AgentMessageRole, AgentRunStatus, Prisma, type AgentMessage } from '@prisma/client';
import type {
  AgentActionPreview,
  AgentActionResult,
  AgentChatDetailDto,
  AgentChatDto,
  AgentContentBlock,
  AgentMessageDto,
  AgentPendingActionDto,
  AgentRunSummaryDto,
  AgentActionExecution,
  AgentToolRiskTier,
} from '@bandeja/shared/agentContract';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import type { AgentLlmMessage } from './llm/deepseekStream';

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
  };
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
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

export async function listAgentChats(userId: string): Promise<AgentChatDto[]> {
  const chats = await prisma.agentChat.findMany({
    where: { userId, archivedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: CHAT_LIST_LIMIT,
    include: CHAT_LIST_INCLUDE,
  });
  return chats.map(toAgentChatDto);
}

export async function createAgentChat(userId: string): Promise<AgentChatDto> {
  const chat = await prisma.agentChat.create({ data: { userId }, include: CHAT_LIST_INCLUDE });
  return toAgentChatDto(chat);
}

/** Owner-scoped, non-archived chat or 404. */
export async function requireOwnedAgentChat(userId: string, chatId: string) {
  const chat = await prisma.agentChat.findFirst({ where: { id: chatId, userId, archivedAt: null } });
  if (!chat) throw agentChatNotFound();
  return chat;
}

export async function getAgentChatDetail(userId: string, chatId: string): Promise<AgentChatDetailDto> {
  const chat = await prisma.agentChat.findFirst({
    where: { id: chatId, userId, archivedAt: null },
    include: CHAT_LIST_INCLUDE,
  });
  if (!chat) throw agentChatNotFound();
  const [messagesDesc, actions] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { chatId },
      orderBy: { seq: 'desc' },
      take: CHAT_DETAIL_MESSAGE_LIMIT,
    }),
    prisma.agentPendingAction.findMany({ where: { chatId, userId }, orderBy: { createdAt: 'asc' } }),
  ]);
  return {
    ...toAgentChatDto(chat),
    messages: messagesDesc.reverse().map(toAgentMessageDto),
    actions: actions.map(toAgentPendingActionDto),
  };
}

export async function renameAgentChat(userId: string, chatId: string, title: string): Promise<AgentChatDto> {
  await requireOwnedAgentChat(userId, chatId);
  const chat = await prisma.agentChat.update({
    where: { id: chatId },
    data: { title: title.trim().slice(0, AGENT_CHAT_TITLE_MAX) || null },
    include: CHAT_LIST_INCLUDE,
  });
  return toAgentChatDto(chat);
}

/** Archive (the DELETE route). Cancels nothing by itself; the route cancels a live run first. */
export async function archiveAgentChat(userId: string, chatId: string): Promise<void> {
  await requireOwnedAgentChat(userId, chatId);
  await prisma.agentChat.update({ where: { id: chatId }, data: { archivedAt: new Date() } });
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
