import { Middleware } from 'grammy';
import { BotContext } from './types';
import { getLanguageCode } from './utils';

export const requireUser: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.from) {
    await ctx.reply('❌ Unable to identify your Telegram account.');
    return;
  }
  ctx.telegramId = ctx.from.id.toString();
  ctx.lang = getLanguageCode(ctx.from.language_code);
  return next();
};

export const requireChat: Middleware<BotContext> = async (ctx, next) => {
  if (!ctx.chat) {
    await ctx.reply('❌ Unable to identify chat.');
    return;
  }
  return next();
};

