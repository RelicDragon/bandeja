/**
 * Telegram AI assistant (docs/domains/agent.md § Telegram channel): the same agent, tables,
 * queue, principal, limits and confirmation flow as the app's My → AI tab.
 *
 * Entry: `/ai` (in the "/" menu) or the "🤖 AI assistant" button → intro + 3 example
 * prompts, **assistant mode** on. In assistant mode, plain text in the private chat is a
 * question for the current agent chat. Routing precedence for free text (message.handler):
 *   1. a pending Telegram input (reply-to-chat bridging, invite-decline reason) — unchanged;
 *   2. assistant mode → the agent;
 *   3. otherwise the usual "use the commands" reminder (with an AI button when enabled).
 * Commands always run as commands. Mode is left via 🚪 Exit (or expires after 24h idle).
 *
 * Identity: every update re-derives the principal from `ctx.from.id` → `User.telegramId`
 * → `loadAgentPrincipal` (active user). Callback payloads carry only ids; every service
 * call is owner-scoped, so another user's run / chat / action id behaves as missing.
 * Unlinked users get the login link flow and no agent access. Private chats only.
 *
 * Permissions (plan §15, 8c): the card's ♾ Always allow confirms with `remember: 'always'`;
 * 🔐 Permissions (controls row, `/ai permissions`) lists the user's write tools and toggles
 * Ask ↔ Always allow through the permission service (critical tools are refused).
 */
import type {
  AgentPendingActionDto,
  AgentToolPermissionDto,
  AgentToolPermissionMode,
} from '@bandeja/shared/agentContract';
import { AGENT_MESSAGE_MAX_LENGTH } from '@bandeja/shared/agentContract';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { ApiError } from '../../../utils/ApiError';
import { agentBotT } from './agentBotCopy';
import { paginateChats, renderChatsPage, renderSwitched } from './agentBotChatList';
import { renderPermissionsMenu, renderPermissionsResetConfirm } from './agentBotPermissions';
import {
  type AgentBotCallback,
  type AgentBotLinkOptions,
  actionOutcomeOf,
  clientHandoff,
  controlsKeyboard,
  introKeyboard,
  parseAgentCallback,
  renderAgentActionOutcome,
} from './agentBotView';
import type { AgentBotRunBinding, AgentBotStateStore } from './agentBotState';
import { type AgentBotRunWatcher, type AgentBotTelegramApi, sendTelegramHtml } from './agentBotRunWatcher';
import { escapeTelegramHtml } from './agentTelegramHtml';
import type { TelegramMessageRender } from './telegramEditThrottler';

export type AgentBotUser = {
  id: string;
  isAdmin: boolean;
  language: string | null;
  /** Current city's zone (booking / slot tz labels); null when unknown. */
  timeZone?: string | null;
};

/** The subset of a grammy context the assistant uses (grammy's `Context` satisfies it). */
export interface AgentBotCtx {
  from?: { id: number; language_code?: string };
  chat?: { id: number; type: string };
  message?: { text?: string; message_id: number };
  callbackQuery?: { data?: string; message?: { message_id: number } };
  match?: string | RegExpMatchArray | null;
  api: AgentBotTelegramApi;
  answerCallbackQuery(other?: { text?: string; show_alert?: boolean }): Promise<unknown>;
}

export type AgentBotDecision = { action: AgentPendingActionDto; runId: string | null; remembered?: boolean };

export type AgentBotActionsPort = {
  /** `remember: 'always'` → also store ALWAYS_ALLOW (400 `PERMISSION_NOT_ALLOWED` on critical). */
  confirm(
    userId: string,
    actionId: string,
    locale: string,
    options?: { remember?: 'always' },
  ): Promise<AgentBotDecision>;
  reject(userId: string, actionId: string, locale: string): Promise<{ action: AgentPendingActionDto; runId: string | null }>;
  /** Owner-scoped chat id of an action (the "Open in app" target on 409 CLIENT_EXECUTION_REQUIRED). */
  chatIdOf?(userId: string, actionId: string): Promise<string | null>;
};

/** `agentToolPermission.service.ts` for the tapping user (names localized by `locale`). */
export type AgentBotPermissionsPort = {
  list(user: AgentBotUser, locale: string): Promise<AgentToolPermissionDto[]>;
  set(user: AgentBotUser, toolName: string, mode: AgentToolPermissionMode, locale: string): Promise<AgentToolPermissionDto>;
  resetAll(user: AgentBotUser, locale: string): Promise<AgentToolPermissionDto[]>;
};

export type AgentBotChatsPort = {
  ensureCurrent(userId: string): Promise<{ id: string; title: string | null }>;
  startNew(userId: string): Promise<{ id: string }>;
  list(userId: string): Promise<{ id: string; title: string | null; updatedAt: string }[]>;
  switchTo(
    userId: string,
    chatId: string,
  ): Promise<{ title: string | null; exchange: { user: string | null; assistant: string | null } }>;
};

export type AgentBotDeps = {
  /** `User.telegramId` → active user (principal), or null when not linked / inactive. */
  resolveUser(telegramId: string): Promise<AgentBotUser | null>;
  /** `sendAgentUserMessage` (quota, budget, busy, queue caps; run starts QUEUED). */
  sendMessage(input: { user: AgentBotUser; chatId: string; text: string; locale: string }): Promise<{ runId: string }>;
  cancelRun(userId: string, runId: string): Promise<void>;
  actions: AgentBotActionsPort;
  permissions: AgentBotPermissionsPort;
  chats: AgentBotChatsPort;
  state: AgentBotStateStore;
  watcher: AgentBotRunWatcher;
  /** Language: the user's app language, else the Telegram `language_code`. */
  languageFor(user: AgentBotUser | null, telegramLanguageCode: string | undefined): string;
  /** The existing login/link flow for unlinked users. */
  replyLoginLink(ctx: AgentBotCtx): Promise<void>;
  /** App links (handoffs, "Open in app"); without it cards carry no URL buttons. */
  links?: AgentBotLinkOptions;
  now?: () => number;
};

function codeOf(error: unknown): string | null {
  if (error instanceof ApiError && typeof error.data?.code === 'string') return error.data.code;
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return null;
}

function statusOf(error: unknown): number | null {
  if (error instanceof ApiError) return error.statusCode;
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const value = (error as { statusCode: unknown }).statusCode;
    return typeof value === 'number' ? value : null;
  }
  return null;
}

/** ApiError from the shared send path → the user-facing line. */
export function sendErrorText(error: unknown, lang: string): string {
  switch (codeOf(error)) {
    case 'RATE_LIMITED':
      return agentBotT('error.rateLimited', lang);
    case 'BUDGET_EXCEEDED':
      return agentBotT('error.budget', lang);
    case 'CHAT_BUSY':
      return agentBotT('error.busy', lang);
    case 'LLM_ERROR':
      return agentBotT('error.llm', lang);
    default:
      break;
  }
  if (statusOf(error) === 400) return agentBotT('error.tooLong', lang, { max: AGENT_MESSAGE_MAX_LENGTH });
  return agentBotT('error.generic', lang);
}

/** `/ai permissions` opens the menu instead of asking the model. */
const AI_PERMISSIONS_SUBCOMMAND = /^permissions$/i;

function isPrivate(ctx: AgentBotCtx): boolean {
  return ctx.chat?.type === 'private';
}

export class TelegramAgentBot {
  constructor(private readonly deps: AgentBotDeps) {}

  private async reply(ctx: AgentBotCtx, render: TelegramMessageRender): Promise<{ message_id: number } | null> {
    if (!ctx.chat) return null;
    return sendTelegramHtml(ctx.api, ctx.chat.id, render);
  }

  private async replyText(ctx: AgentBotCtx, text: string, keyboard?: InlineKeyboardMarkup) {
    return this.reply(ctx, { html: escapeTelegramHtml(text), keyboard });
  }

  /** Linked + enabled user, or null after telling the user why not. */
  private async userForMessage(ctx: AgentBotCtx): Promise<{ user: AgentBotUser; lang: string } | null> {
    if (!ctx.from) return null;
    const telegramId = String(ctx.from.id);
    const user = await this.deps.resolveUser(telegramId);
    if (!user) {
      await this.deps.state.exitAssistantMode(telegramId).catch(() => {});
      await this.deps.replyLoginLink(ctx);
      return null;
    }
    const lang = this.deps.languageFor(user, ctx.from.language_code);
    return { user, lang };
  }

  /** "🤖 AI assistant" button for another message, only for linked users. */
  async openButtonFor(telegramId: string, telegramLanguageCode?: string): Promise<InlineKeyboardMarkup | undefined> {
    const user = await this.deps.resolveUser(telegramId).catch(() => null);
    if (!user) return undefined;
    const lang = this.deps.languageFor(user, telegramLanguageCode);
    return { inline_keyboard: [[{ text: agentBotT('button.open', lang), callback_data: 'agent:open' }]] };
  }

  private async showIntro(ctx: AgentBotCtx, lang: string): Promise<void> {
    // `intro` is trusted copy with a <b> title; nothing user-provided in it.
    await this.reply(ctx, { html: agentBotT('intro', lang), keyboard: introKeyboard(lang) });
  }

  /** `/ai` — enter assistant mode; `/ai <question>` also asks it right away. */
  handleAiCommand = async (ctx: AgentBotCtx): Promise<void> => {
    if (!isPrivate(ctx) || !ctx.from) return;
    const resolved = await this.userForMessage(ctx);
    if (!resolved) return;
    await this.deps.state.enterAssistantMode(String(ctx.from.id));
    const question = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    if (AI_PERMISSIONS_SUBCOMMAND.test(question)) {
      await this.showPermissions(ctx, resolved.user, resolved.lang, undefined);
      return;
    }
    if (question) {
      await this.ask(ctx, resolved.user, resolved.lang, question);
      return;
    }
    await this.showIntro(ctx, resolved.lang);
  };

  /**
   * Free text from `message.handler` after pending inputs had their turn. Returns true when
   * the message was the assistant's (assistant mode on), false to let the caller continue.
   */
  handleText = async (ctx: AgentBotCtx, message: { text?: string }): Promise<boolean> => {
    if (!isPrivate(ctx) || !ctx.from) return false;
    const telegramId = String(ctx.from.id);
    if (!(await this.deps.state.isAssistantMode(telegramId))) return false;
    const text = message.text?.trim() ?? '';
    if (text.startsWith('/')) return false;
    const resolved = await this.userForMessage(ctx);
    if (!resolved) return true;
    await this.deps.state.enterAssistantMode(telegramId); // sliding TTL
    if (!text) {
      await this.replyText(ctx, agentBotT('error.textOnly', resolved.lang));
      return true;
    }
    await this.ask(ctx, resolved.user, resolved.lang, text);
    return true;
  };

  /** Sends one question: status message first, then enqueue, then watch the run. */
  private async ask(ctx: AgentBotCtx, user: AgentBotUser, lang: string, text: string): Promise<void> {
    if (!ctx.chat) return;
    if (text.length > AGENT_MESSAGE_MAX_LENGTH) {
      await this.replyText(ctx, agentBotT('error.tooLong', lang, { max: AGENT_MESSAGE_MAX_LENGTH }));
      return;
    }
    const status = await this.replyText(ctx, agentBotT('status.sending', lang));
    if (!status) return;
    const chatId = ctx.chat.id;
    let runId: string;
    try {
      const chat = await this.deps.chats.ensureCurrent(user.id);
      ({ runId } = await this.deps.sendMessage({ user, chatId: chat.id, text, locale: lang }));
    } catch (error) {
      if (statusOf(error) === null || (statusOf(error) ?? 500) >= 500) {
        console.error('[telegram-agent] send failed', { userId: user.id, error });
      }
      await ctx.api
        .editMessageText(chatId, status.message_id, escapeTelegramHtml(sendErrorText(error, lang)), {
          parse_mode: 'HTML',
          reply_markup: controlsKeyboard(lang),
        })
        .catch(() => {});
      return;
    }
    await this.startWatching({
      runId,
      userId: user.id,
      telegramChatId: chatId,
      statusMessageId: status.message_id,
      lang,
      timeZone: user.timeZone ?? null,
    });
  }

  private async startWatching(binding: Omit<AgentBotRunBinding, 'createdAt'>): Promise<void> {
    const full: AgentBotRunBinding = { ...binding, createdAt: (this.deps.now ?? Date.now)() };
    await this.deps.state
      .saveBinding(full)
      .catch((error) => console.error('[telegram-agent] binding save failed', { runId: full.runId, error }));
    void this.deps.watcher.watch(full);
  }

  /** A follow-up run (after Confirm): a fresh status message that is then streamed. */
  private async watchFollowUp(ctx: AgentBotCtx, user: AgentBotUser, lang: string, runId: string): Promise<void> {
    if (!ctx.chat) return;
    const status = await this.replyText(ctx, agentBotT('status.thinking', lang));
    if (!status) return;
    await this.startWatching({
      runId,
      userId: user.id,
      telegramChatId: ctx.chat.id,
      statusMessageId: status.message_id,
      lang,
      timeZone: user.timeZone ?? null,
    });
  }

  /** `agent:*` callback queries. Identity always from `ctx.from`, never from the payload. */
  handleCallback = async (ctx: AgentBotCtx): Promise<void> => {
    const data = ctx.callbackQuery?.data ?? '';
    const callback = parseAgentCallback(data);
    if (!callback || !ctx.from || !isPrivate(ctx)) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    const telegramId = String(ctx.from.id);
    const user = await this.deps.resolveUser(telegramId);
    const lang = this.deps.languageFor(user, ctx.from.language_code);
    if (!user) {
      await ctx.answerCallbackQuery({ text: agentBotT('error.notLinked', lang), show_alert: true }).catch(() => {});
      await this.deps.replyLoginLink(ctx);
      return;
    }
    try {
      await this.dispatchCallback(ctx, callback, user, lang, telegramId);
    } catch (error) {
      if (statusOf(error) === 404) {
        await ctx.answerCallbackQuery({ text: agentBotT('toast.gone', lang) }).catch(() => {});
        return;
      }
      console.error('[telegram-agent] callback failed', { data, error });
      await ctx.answerCallbackQuery({ text: agentBotT('error.generic', lang), show_alert: true }).catch(() => {});
    }
  };

  private async dispatchCallback(
    ctx: AgentBotCtx,
    callback: AgentBotCallback,
    user: AgentBotUser,
    lang: string,
    telegramId: string,
  ): Promise<void> {
    const messageId = ctx.callbackQuery?.message?.message_id;
    switch (callback.kind) {
      case 'open': {
        await this.deps.state.enterAssistantMode(telegramId);
        await ctx.answerCallbackQuery();
        await this.showIntro(ctx, lang);
        return;
      }
      case 'example': {
        await this.deps.state.enterAssistantMode(telegramId);
        await ctx.answerCallbackQuery();
        const question = agentBotT(`example.${callback.index}`, lang);
        await this.reply(ctx, { html: `💬 <i>${escapeTelegramHtml(question)}</i>` });
        await this.ask(ctx, user, lang, question);
        return;
      }
      case 'new': {
        await this.deps.state.enterAssistantMode(telegramId);
        await this.deps.chats.startNew(user.id);
        await ctx.answerCallbackQuery();
        await this.replyText(ctx, agentBotT('newChat.started', lang), controlsKeyboard(lang));
        return;
      }
      case 'list':
      case 'chats': {
        const chats = await this.deps.chats.list(user.id);
        const page = renderChatsPage(paginateChats(chats, callback.kind === 'chats' ? callback.page : 0, lang), lang);
        await ctx.answerCallbackQuery();
        if (callback.kind === 'chats' && messageId && ctx.chat) {
          await ctx.api
            .editMessageText(ctx.chat.id, messageId, page.html, { parse_mode: 'HTML', reply_markup: page.keyboard })
            .catch(() => {});
          return;
        }
        await this.reply(ctx, page);
        return;
      }
      case 'switch': {
        const switched = await this.deps.chats.switchTo(user.id, callback.chatId);
        await this.deps.state.enterAssistantMode(telegramId);
        await ctx.answerCallbackQuery();
        const render = { html: renderSwitched(switched.title, switched.exchange, lang), keyboard: controlsKeyboard(lang) };
        if (messageId && ctx.chat) {
          const edited = await ctx.api
            .editMessageText(ctx.chat.id, messageId, render.html, { parse_mode: 'HTML', reply_markup: render.keyboard })
            .then(() => true)
            .catch(() => false);
          if (edited) return;
        }
        await this.reply(ctx, render);
        return;
      }
      case 'stop': {
        await this.deps.cancelRun(user.id, callback.runId);
        await ctx.answerCallbackQuery({ text: agentBotT('toast.stopping', lang) });
        return;
      }
      case 'exit': {
        await this.deps.state.exitAssistantMode(telegramId);
        await ctx.answerCallbackQuery();
        await this.replyText(ctx, agentBotT('exit.done', lang));
        return;
      }
      case 'confirm':
      case 'always':
      case 'reject': {
        await this.decide(ctx, callback.kind, callback.actionId, user, lang, messageId);
        return;
      }
      case 'perms': {
        await ctx.answerCallbackQuery();
        await this.showPermissions(ctx, user, lang, callback.edit ? messageId : undefined);
        return;
      }
      case 'perm': {
        await this.togglePermission(ctx, callback.tool, user, lang, messageId);
        return;
      }
      case 'permReset': {
        if (!callback.confirmed) {
          await ctx.answerCallbackQuery();
          await this.editOrReply(ctx, messageId, renderPermissionsResetConfirm(lang));
          return;
        }
        const tools = await this.deps.permissions.resetAll(user, lang);
        await ctx.answerCallbackQuery({ text: agentBotT('perm.resetDone', lang) });
        await this.editOrReply(ctx, messageId, renderPermissionsMenu(tools, lang));
        return;
      }
    }
  }

  /** Edits the tapped message (menus change in place); a new message when that fails. */
  private async editOrReply(ctx: AgentBotCtx, messageId: number | undefined, render: TelegramMessageRender): Promise<void> {
    if (messageId && ctx.chat) {
      const edited = await ctx.api
        .editMessageText(ctx.chat.id, messageId, render.html, { parse_mode: 'HTML', reply_markup: render.keyboard })
        .then(() => true)
        .catch(() => false);
      if (edited) return;
    }
    await this.reply(ctx, render);
  }

  /** 🔐 Permissions menu: a new message, or the menu message edited in place (`messageId`). */
  private async showPermissions(ctx: AgentBotCtx, user: AgentBotUser, lang: string, messageId: number | undefined) {
    const tools = await this.deps.permissions.list(user, lang);
    const render = renderPermissionsMenu(tools, lang);
    if (messageId) await this.editOrReply(ctx, messageId, render);
    else await this.reply(ctx, render);
  }

  /** Ask ↔ Always allow for one standard tool; critical tools are refused before any write. */
  private async togglePermission(
    ctx: AgentBotCtx,
    ref: { name: string } | { index: number },
    user: AgentBotUser,
    lang: string,
    messageId: number | undefined,
  ): Promise<void> {
    const tools = await this.deps.permissions.list(user, lang);
    const tool = 'name' in ref ? tools.find((t) => t.toolName === ref.name) : tools[ref.index];
    if (!tool) {
      // Not (or no longer) one of this user's write tools: nothing stored, menu refreshed.
      await ctx.answerCallbackQuery({ text: agentBotT('toast.gone', lang) }).catch(() => {});
      await this.editOrReply(ctx, messageId, renderPermissionsMenu(tools, lang));
      return;
    }
    if (!tool.canAlwaysAllow) {
      await ctx.answerCallbackQuery({ text: agentBotT('perm.lockedAlert', lang), show_alert: true }).catch(() => {});
      return;
    }
    const mode: AgentToolPermissionMode = tool.mode === 'ALWAYS_ALLOW' ? 'ASK' : 'ALWAYS_ALLOW';
    let updated: AgentToolPermissionDto;
    try {
      updated = await this.deps.permissions.set(user, tool.toolName, mode, lang);
    } catch (error) {
      if (codeOf(error) === 'PERMISSION_NOT_ALLOWED') {
        await ctx.answerCallbackQuery({ text: agentBotT('perm.lockedAlert', lang), show_alert: true }).catch(() => {});
        return;
      }
      throw error;
    }
    const toast = updated.mode === 'ALWAYS_ALLOW' ? 'perm.nowAlways' : 'perm.nowAsk';
    await ctx.answerCallbackQuery({ text: agentBotT(toast, lang, { tool: updated.name }) }).catch(() => {});
    const next = tools.map((t) => (t.toolName === updated.toolName ? updated : t));
    await this.editOrReply(ctx, messageId, renderPermissionsMenu(next, lang));
  }

  private async decide(
    ctx: AgentBotCtx,
    decision: 'confirm' | 'always' | 'reject',
    actionId: string,
    user: AgentBotUser,
    lang: string,
    messageId: number | undefined,
  ): Promise<void> {
    let result: AgentBotDecision;
    try {
      if (decision === 'reject') result = await this.deps.actions.reject(user.id, actionId, lang);
      else if (decision === 'always') result = await this.deps.actions.confirm(user.id, actionId, lang, { remember: 'always' });
      else result = await this.deps.actions.confirm(user.id, actionId, lang);
    } catch (error) {
      const status = statusOf(error);
      if (status === 400 && codeOf(error) === 'PERMISSION_NOT_ALLOWED') {
        // Critical / escalated call: nothing ran; the card stays so "Allow once" still works.
        await ctx.answerCallbackQuery({ text: agentBotT('action.cannotAlwaysAllow', lang), show_alert: true }).catch(() => {});
        return;
      }
      if (status === 404) {
        // Missing or someone else's action: nothing happens, nothing is revealed.
        await ctx.answerCallbackQuery({ text: agentBotT('toast.gone', lang) }).catch(() => {});
        return;
      }
      if (status === 409 && codeOf(error) === 'CLIENT_EXECUTION_REQUIRED') {
        // Only the app can run it (booking plan §14.5): hand off instead of an error.
        await this.handOffToApp(ctx, actionId, user, lang, messageId);
        return;
      }
      if (status === 409) {
        await ctx.answerCallbackQuery({ text: agentBotT('action.gone', lang), show_alert: true }).catch(() => {});
        if (messageId && ctx.chat) {
          await ctx.api
            .editMessageReplyMarkup(ctx.chat.id, messageId, { reply_markup: { inline_keyboard: [] } })
            .catch(() => {});
        }
        return;
      }
      if (status === 501) {
        await ctx.answerCallbackQuery({ text: agentBotT('action.notAvailable', lang), show_alert: true }).catch(() => {});
        return;
      }
      throw error;
    }
    await ctx.answerCallbackQuery().catch(() => {});
    const outcome = actionOutcomeOf(result.action.status);
    if (outcome !== 'pending' && messageId && ctx.chat) {
      const render = renderAgentActionOutcome(result.action, lang, outcome, {
        remembered: result.remembered === true,
        links: this.deps.links,
      });
      await ctx.api
        .editMessageText(ctx.chat.id, messageId, render.html, { parse_mode: 'HTML', reply_markup: render.keyboard })
        .catch(() => {});
    }
    if (result.runId) await this.watchFollowUp(ctx, user, lang, result.runId);
  }

  /**
   * ✅ / ♾ on a client-executed action (a card rendered before the action was known to be
   * client-run, or an old card): alert, then the card's buttons become ✖ Reject · 📱 Open in
   * app. Without URL buttons (loopback app URL) the link is sent as a message.
   */
  private async handOffToApp(
    ctx: AgentBotCtx,
    actionId: string,
    user: AgentBotUser,
    lang: string,
    messageId: number | undefined,
  ): Promise<void> {
    await ctx.answerCallbackQuery({ text: agentBotT('action.clientRequired', lang), show_alert: true }).catch(() => {});
    if (!ctx.chat) return;
    const chatId = this.deps.actions.chatIdOf
      ? await this.deps.actions.chatIdOf(user.id, actionId).catch(() => null)
      : null;
    const handoff = clientHandoff(actionId, chatId, lang, this.deps.links);
    if (messageId) {
      await ctx.api
        .editMessageReplyMarkup(ctx.chat.id, messageId, { reply_markup: { inline_keyboard: handoff.rows } })
        .catch(() => {});
    }
    if (handoff.anchors) {
      await ctx.api
        .sendMessage(ctx.chat.id, handoff.anchors, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } })
        .catch(() => {});
    }
  }

  /** Bot start: finish / re-attach runs that Telegram messages were tracking. */
  async resumeWatchers(): Promise<number> {
    return this.deps.watcher.resumeAll();
  }
}
