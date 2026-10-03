/**
 * Which agent chat the Telegram assistant writes to, without a schema change:
 * the **current chat is the user's most recently updated non-archived `AgentChat`** — the
 * same list the app's AI tab shows, newest first.
 *   - Sending a message bumps `updatedAt` (`appendAgentMessage`), so it stays current.
 *   - "New chat" creates one (or reuses the current chat when it is still empty).
 *   - "Switch" touches the chosen chat's `updatedAt`, which makes it current here and
 *     moves it to the top of the app's list.
 * The app and Telegram therefore share one "current" notion: whatever was used last.
 * Every read is owner-scoped (`where: { id, userId }`); foreign ids behave as missing.
 */
import type { AgentChatDto, AgentContentBlock } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { createAgentChat, listAgentChats, requireOwnedAgentChat } from '../../agent/agentChat.service';
import { lastExchange, type MessageRow } from './agentBotChatList';

export async function listBotChats(userId: string): Promise<AgentChatDto[]> {
  return listAgentChats(userId);
}

export async function getCurrentAgentChat(userId: string): Promise<{ id: string; title: string | null } | null> {
  return prisma.agentChat.findFirst({
    where: { userId, archivedAt: null, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true },
  });
}

/** The current chat, creating the first one when the user has none. */
export async function ensureCurrentAgentChat(userId: string): Promise<{ id: string; title: string | null }> {
  const current = await getCurrentAgentChat(userId);
  if (current) return current;
  const created = await createAgentChat(userId);
  return { id: created.id, title: created.title };
}

/** "New chat": reuses the current chat when it has no messages yet (no empty-chat pile-up). */
export async function startNewAgentChat(userId: string): Promise<{ id: string }> {
  const current = await getCurrentAgentChat(userId);
  if (current) {
    const hasMessages = await prisma.agentMessage.findFirst({ where: { chatId: current.id }, select: { id: true } });
    if (!hasMessages) {
      await prisma.agentChat.update({ where: { id: current.id }, data: { updatedAt: new Date() } });
      return { id: current.id };
    }
  }
  const created = await createAgentChat(userId);
  return { id: created.id };
}

/** Owner-scoped switch (404 for foreign / archived ids); returns what to show. */
export async function switchAgentChat(
  userId: string,
  chatId: string,
): Promise<{ title: string | null; exchange: { user: string | null; assistant: string | null } }> {
  const chat = await requireOwnedAgentChat(userId, chatId);
  await prisma.agentChat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
  const recent = await prisma.agentMessage.findMany({
    where: { chatId: chat.id },
    orderBy: { seq: 'desc' },
    take: 20,
    select: { role: true, content: true },
  });
  const messages: MessageRow[] = recent.reverse().map((m) => ({
    role: m.role,
    blocks: Array.isArray(m.content) ? (m.content as unknown as AgentContentBlock[]) : [],
  }));
  return { title: chat.title, exchange: lastExchange(messages) };
}
