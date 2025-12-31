import { Middleware } from 'grammy';
import { BotContext } from './types';
import { getLanguageCode } from './utils';
import { t } from '../../utils/translations';

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

