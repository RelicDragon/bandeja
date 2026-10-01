/**
 * Which URLs `web_fetch` may read (docs/plans/ai-agent-web-search.md D1, §13.6):
 *
 *   1. URLs a `web_search` returned earlier in THIS run (session set, so a fetch in the same
 *      step works before the TOOL message is saved);
 *   2. URLs a `web_search` returned earlier in THIS chat (persisted `tool_result` blocks with
 *      `web.kind === 'search'`);
 *   3. URLs the user typed in this chat (USER `text` blocks).
 *
 * Compared in canonical form, so the model can drop tracking noise but never add or change
 * a parameter (no exfiltration through `?q=<data>`). Model text, fetched pages and other
 * chats never add URLs.
 */
import { AgentMessageRole } from '@prisma/client';
import type { AgentContentBlock } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import type { AgentWebRunSession } from './agentWebSession';
import { canonicalizeUrl, extractUrlsFromText } from './webUrl';

export const AGENT_WEB_ALLOWLIST_HISTORY = 200;

function blocksOf(content: unknown): AgentContentBlock[] {
  return Array.isArray(content) ? (content as AgentContentBlock[]) : [];
}

/** Canonical URLs from stored messages (pure; exported for tests). */
export function allowedUrlsFromMessages(messages: { role: AgentMessageRole; content: unknown }[]): Set<string> {
  const out = new Set<string>();
  const add = (url: string) => {
    const canonical = canonicalizeUrl(url);
    if (canonical) out.add(canonical);
  };
  for (const message of messages) {
    for (const block of blocksOf(message.content)) {
      if (message.role === AgentMessageRole.USER && block.type === 'text') {
        for (const url of extractUrlsFromText(block.text)) add(url);
      } else if (message.role === AgentMessageRole.TOOL && block.type === 'tool_result' && block.web?.kind === 'search') {
        for (const result of block.web.results) add(result.url);
      }
    }
  }
  return out;
}

export async function isUrlAllowedForFetch(
  ctx: { chatId?: string; web?: AgentWebRunSession; principal: { userId: string } },
  url: string,
): Promise<boolean> {
  const canonical = canonicalizeUrl(url);
  if (!canonical) return false;
  if (ctx.web?.allowedUrls.has(canonical)) return true;
  if (!ctx.chatId) return false;
  const messages = await prisma.agentMessage.findMany({
    // Owner check in the query: a chat id of someone else contributes nothing.
    where: { chatId: ctx.chatId, chat: { userId: ctx.principal.userId }, role: { in: [AgentMessageRole.USER, AgentMessageRole.TOOL] } },
    orderBy: { seq: 'desc' },
    take: AGENT_WEB_ALLOWLIST_HISTORY,
    select: { role: true, content: true },
  });
  return allowedUrlsFromMessages(messages).has(canonical);
}
