/**
 * Pure parts of the Telegram assistant's chat switching (see `agentBotChats.ts` for the
 * "current chat = most recently updated non-archived AgentChat" rule): picking the current
 * chat, paging the list, rendering it, and extracting the last exchange of a chat.
 */
import type { AgentChatDto, AgentContentBlock, AgentMessageRole } from '@bandeja/shared/agentContract';
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { agentBotT } from './agentBotCopy';
import { agentCallbackData, controlsRows } from './agentBotView';
import { agentMarkdownToTelegramHtml, escapeTelegramHtml, tailForPreview } from './agentTelegramHtml';

export const AGENT_BOT_CHATS_PAGE_SIZE = 8;
/** Only the newest chats are listed in Telegram (the app lists up to 100). */
export const AGENT_BOT_CHATS_MAX_PAGES = 5;

type ChatRow = Pick<AgentChatDto, 'id' | 'title' | 'updatedAt'>;

/** Newest `updatedAt` wins (the list is already sorted, but don't rely on it). */
export function pickCurrentChat<T extends ChatRow>(chats: T[]): T | null {
  let best: T | null = null;
  for (const chat of chats) {
    if (!best || Date.parse(chat.updatedAt) > Date.parse(best.updatedAt)) best = chat;
  }
  return best;
}

export type ChatsPage = {
  page: number;
  pages: number;
  rows: { chatId: string; label: string; current: boolean }[];
};

const TITLE_MAX = 40;

export function paginateChats(chats: ChatRow[], requestedPage: number, lang: string): ChatsPage {
  const sorted = [...chats]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, AGENT_BOT_CHATS_PAGE_SIZE * AGENT_BOT_CHATS_MAX_PAGES);
  const pages = Math.max(1, Math.ceil(sorted.length / AGENT_BOT_CHATS_PAGE_SIZE));
  const page = Math.min(Math.max(0, Math.trunc(requestedPage) || 0), pages - 1);
  const currentId = sorted[0]?.id ?? null;
  const rows = sorted
    .slice(page * AGENT_BOT_CHATS_PAGE_SIZE, (page + 1) * AGENT_BOT_CHATS_PAGE_SIZE)
    .map((chat) => {
      const title = chat.title?.trim() || agentBotT('chats.untitled', lang);
      const short = title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
      const current = chat.id === currentId;
      return { chatId: chat.id, label: current ? `● ${short}` : short, current };
    });
  return { page, pages, rows };
}

export function renderChatsPage(view: ChatsPage, lang: string): { html: string; keyboard: InlineKeyboardMarkup } {
  if (view.rows.length === 0) {
    return { html: escapeTelegramHtml(agentBotT('chats.empty', lang)), keyboard: { inline_keyboard: controlsRows(lang) } };
  }
  const keyboard: InlineKeyboardButton[][] = view.rows.map((row) => [
    { text: row.label, callback_data: agentCallbackData({ kind: 'switch', chatId: row.chatId }) },
  ]);
  const pager: InlineKeyboardButton[] = [];
  if (view.page > 0) {
    pager.push({ text: agentBotT('button.prev', lang), callback_data: agentCallbackData({ kind: 'chats', page: view.page - 1 }) });
  }
  if (view.page < view.pages - 1) {
    pager.push({ text: agentBotT('button.next', lang), callback_data: agentCallbackData({ kind: 'chats', page: view.page + 1 }) });
  }
  if (pager.length) keyboard.push(pager);
  keyboard.push([
    { text: agentBotT('button.newChat', lang), callback_data: agentCallbackData({ kind: 'new' }) },
    { text: agentBotT('button.exit', lang), callback_data: agentCallbackData({ kind: 'exit' }) },
  ]);
  return {
    html: escapeTelegramHtml(agentBotT('chats.title', lang, { page: view.page + 1, pages: view.pages })),
    keyboard: { inline_keyboard: keyboard },
  };
}

export type MessageRow = { role: AgentMessageRole; blocks: AgentContentBlock[] };

function textOf(blocks: AgentContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<AgentContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/** The last user question and the assistant text after it (messages oldest → newest). */
export function lastExchange(messages: MessageRow[]): { user: string | null; assistant: string | null } {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'USER' && textOf(messages[i].blocks)) {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return { user: null, assistant: null };
  const assistant = messages
    .slice(lastUser + 1)
    .filter((m) => m.role === 'ASSISTANT')
    .map((m) => textOf(m.blocks))
    .filter(Boolean)
    .join('\n\n');
  return { user: textOf(messages[lastUser].blocks), assistant: assistant || null };
}

const EXCHANGE_PART_MAX = 1500;

export function renderSwitched(
  title: string | null,
  exchange: { user: string | null; assistant: string | null },
  lang: string,
): string {
  const heading = escapeTelegramHtml(
    agentBotT('chats.switched', lang, { title: title?.trim() || agentBotT('chats.untitled', lang) }),
  );
  if (!exchange.user) return `${heading}\n\n<i>${escapeTelegramHtml(agentBotT('chats.noMessages', lang))}</i>`;
  const user = `<b>${escapeTelegramHtml(agentBotT('chats.you', lang))}:</b> ${escapeTelegramHtml(
    tailForPreview(exchange.user, EXCHANGE_PART_MAX),
  )}`;
  const assistant = exchange.assistant
    ? `\n\n<b>${escapeTelegramHtml(agentBotT('chats.assistant', lang))}:</b>\n${agentMarkdownToTelegramHtml(
        tailForPreview(exchange.assistant, EXCHANGE_PART_MAX),
      )}`
    : '';
  return `${heading}\n\n${user}${assistant}`;
}
