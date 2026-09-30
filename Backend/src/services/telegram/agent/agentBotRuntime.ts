/**
 * Real dependencies for the Telegram assistant (`TelegramAgentBot`). Everything agent-side
 * is the shared service the HTTP routes use:
 *   - principal: `User.telegramId` → `loadAgentPrincipal` (active users only);
 *   - send: `sendAgentUserMessage` (flag + allowlist, shared per-user quota, budget,
 *     CHAT_BUSY, queued cap; the run is enqueued QUEUED and executed by the queue worker);
 *   - stop: `AgentRunService.cancelRun` (owner-scoped);
 *   - confirm / reject: `AgentActionService.confirm/reject` (owner-scoped, re-authorizes;
 *     ♾ Always allow passes `remember: 'always'`);
 *   - permissions: `AgentToolPermissionService` list / set / reset for the resolved principal;
 *   - events: `AgentRunFeed` over the agent event store (same as SSE).
 */
import type { Bot } from 'grammy';
import prisma from '../../../config/database';
import { config } from '../../../config/env';
import { loadAgentPrincipal } from '../../agent/access/agentPrincipal';
import { getAgentActionService } from '../../agent/agentActions.service';
import { getAgentRunService } from '../../agent/agentRun.service';
import { AgentRunFeed } from '../../agent/agentRunFeed';
import { getAgentToolPermissionService } from '../../agent/agentToolPermission.service';
import { sendAgentUserMessage } from '../../agent/agentSendMessage.service';
import { generateLoginLink } from '../commands/login.command';
import { isLocalhostUrl } from '../shared/message-builder';
import type { BotContext } from '../types';
import { getLanguageCode, getUserLanguage } from '../utils';
import { type AgentBotCtx, type AgentBotUser, TelegramAgentBot } from './agentBot';
import { ensureCurrentAgentChat, listBotChats, startNewAgentChat, switchAgentChat } from './agentBotChats';
import { AgentBotRunWatcher, type AgentBotTelegramApi, type OpenAgentRunFeed } from './agentBotRunWatcher';
import { getAgentBotStateStore } from './agentBotState';

const FEED_KEEPALIVE_MS = 15_000;

async function resolveAgentBotUser(telegramId: string): Promise<AgentBotUser | null> {
  const linked = await prisma.user.findUnique({ where: { telegramId }, select: { id: true } });
  if (!linked) return null;
  try {
    const principal = await loadAgentPrincipal(linked.id);
    const city = principal.currentCityId
      ? await prisma.city.findUnique({ where: { id: principal.currentCityId }, select: { timezone: true } }).catch(() => null)
      : null;
    return {
      id: principal.userId,
      isAdmin: principal.isAdmin,
      language: principal.language,
      timeZone: city?.timezone ?? null,
    };
  } catch {
    return null; // inactive account: same as not linked
  }
}

const openRunFeed: OpenAgentRunFeed = async (binding, onEvent, onEnd) => {
  const run = await prisma.agentRun.findFirst({ where: { id: binding.runId, userId: binding.userId } });
  if (!run) return null;
  const feed = new AgentRunFeed({
    source: getAgentRunService(),
    run,
    after: 0,
    onEvent: (stored) => onEvent(stored.event),
    onEnd,
    keepaliveMs: FEED_KEEPALIVE_MS,
    reloadRun: (runId) => prisma.agentRun.findUnique({ where: { id: runId } }),
  });
  await feed.start();
  return { close: () => feed.close() };
};

let instance: TelegramAgentBot | null = null;

export function createTelegramAgentBot(bot: Bot): TelegramAgentBot {
  const api = bot.api as unknown as AgentBotTelegramApi;
  const state = getAgentBotStateStore();
  const links = { frontendUrl: config.frontendUrl, inlineUrlButtons: !isLocalhostUrl(config.frontendUrl ?? '') };
  const watcher = new AgentBotRunWatcher({ api, state, openFeed: openRunFeed, links });
  instance = new TelegramAgentBot({
    resolveUser: resolveAgentBotUser,
    sendMessage: ({ user, chatId, text, locale }) =>
      sendAgentUserMessage({ user, chatId, text, locale, quota: 'consume' }),
    cancelRun: (userId, runId) => getAgentRunService().cancelRun(userId, runId),
    actions: {
      confirm: (userId, actionId, locale, options) =>
        getAgentActionService().confirm(userId, actionId, locale, { remember: options?.remember ?? null }),
      reject: (userId, actionId, locale) => getAgentActionService().reject(userId, actionId, locale),
      chatIdOf: async (userId, actionId) => {
        const row = await prisma.agentPendingAction.findFirst({
          where: { id: actionId, userId },
          select: { chatId: true },
        });
        return row?.chatId ?? null;
      },
    },
    // The user was just re-resolved from `ctx.from` via a fresh `loadAgentPrincipal`.
    permissions: {
      list: (user, locale) => getAgentToolPermissionService().list({ userId: user.id, isAdmin: user.isAdmin }, locale),
      set: (user, toolName, mode, locale) =>
        getAgentToolPermissionService().set({ userId: user.id, isAdmin: user.isAdmin }, toolName, mode, locale),
      resetAll: (user, locale) =>
        getAgentToolPermissionService().reset({ userId: user.id, isAdmin: user.isAdmin }, undefined, locale),
    },
    chats: {
      ensureCurrent: ensureCurrentAgentChat,
      startNew: startNewAgentChat,
      list: listBotChats,
      switchTo: switchAgentChat,
    },
    state,
    watcher,
    languageFor: (user, code) => (user ? getUserLanguage(user.language, code) : getLanguageCode(code)),
    replyLoginLink: (ctx: AgentBotCtx) => generateLoginLink(ctx as unknown as BotContext),
    links,
  });
  return instance;
}

/** The assistant once the bot is initialized (null when there is no bot token). */
export function getTelegramAgentBot(): TelegramAgentBot | null {
  return instance;
}
