import { Middleware } from 'grammy';
import { BotContext } from '../types';
import { generateAuthCode } from './auth.command';
import { generateLoginLink } from './login.command';
import { t } from '../../../utils/translations';

export const handleStartCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.from || !ctx.lang || !ctx.telegramId) return;

  const payload = (ctx.match as string)?.trim().toLowerCase();

  try {
    if (payload === 'login') {
      await generateLoginLink(ctx);
      return;
    }
    await ctx.reply(t('telegram.welcome', ctx.lang));
    await generateAuthCode(ctx);
  } catch (error) {
    console.error('Error handling start command:', error);
  }
};

