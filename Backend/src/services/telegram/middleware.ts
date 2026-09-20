import { Middleware } from 'grammy';
import { BotContext } from './types';
import { getLanguageCode } from './utils';
import { t } from '../../utils/translations';
import { syncTelegramProfileFromUpdate } from './syncTelegramProfile.service';

export const requireUser: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.from) {
    const lang = ctx.lang || 'en';
    await ctx.reply(t('telegram.unableToIdentifyAccount', lang));
    return;
  }
  ctx.telegramId = ctx.from.id.toString();
  ctx.lang = getLanguageCode(ctx.from.language_code);
  return next();
};

export const syncTelegramProfile: Middleware<BotContext> = async (ctx, next) => {
  if (ctx.telegramId && ctx.from) {
    syncTelegramProfileFromUpdate(ctx.telegramId, {
      username: ctx.from.username ?? null,
      first_name: ctx.from.first_name ?? null,
      last_name: ctx.from.last_name ?? null,
    }).catch((e) => console.error('Telegram profile sync failed', e));
  }
  return next();
};

export const requireChat: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.chat) {
    const lang = ctx.lang || getLanguageCode(ctx.from?.language_code) || 'en';
    await ctx.reply(t('telegram.unableToIdentifyChat', lang));
    return;
  }
  return next();
};

export const requirePrivateChat: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.chat) {
    const lang = ctx.lang || getLanguageCode(ctx.from?.language_code) || 'en';
    await ctx.reply(t('telegram.unableToIdentifyChat', lang));
    return;
  }
  if (ctx.chat.type !== 'private') {
    return;
  }
  return next();
};

/**
 * PRD 356 — per-chat command rate limit.
 *
 * A fixed window keyed by chat id. In-process on purpose: it exists to stop one
 * chat hammering a command, not to enforce a global quota, and the bot runs a
 * single long-polling instance. The window map is pruned on every call so it
 * cannot grow without bound.
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitHits = new Map<string, number[]>();

export function chatRateLimitAllows(
  chatKey: string,
  max: number,
  now = Date.now(),
  windowMs = RATE_LIMIT_WINDOW_MS,
): boolean {
  const since = now - windowMs;
  for (const [key, stamps] of rateLimitHits) {
    const kept = stamps.filter((s) => s > since);
    if (kept.length === 0) rateLimitHits.delete(key);
    else rateLimitHits.set(key, kept);
  }

  const hits = rateLimitHits.get(chatKey) ?? [];
  if (hits.length >= max) return false;
  hits.push(now);
  rateLimitHits.set(chatKey, hits);
  return true;
}

export function resetChatRateLimitForTests(): void {
  rateLimitHits.clear();
}

/** 10 commands per minute per chat (PRD 356). Silently drops the overflow. */
export function rateLimitChat(max = 10): Middleware<BotContext> {
  return async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return next();
    if (!chatRateLimitAllows(String(chatId), max)) return;
    return next();
  };
}

export const requireGroupChat: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.chat) {
    const lang = ctx.lang || getLanguageCode(ctx.from?.language_code) || 'en';
    await ctx.reply(t('telegram.unableToIdentifyChat', lang));
    return;
  }
  if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
    return;
  }
  return next();
};

