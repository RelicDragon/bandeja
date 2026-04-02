import { Middleware } from 'grammy';
import { BotContext } from '../types';
import { generateAuthCode } from './auth.command';
import { generateLoginLink } from './login.command';
import { generateAccountLinkFlow } from './accountLink.command';
import { t } from '../../../utils/translations';

export const handleStartCommand: Middleware<BotContext> = async (ctx) => {
  if (!ctx.from || !ctx.lang || !ctx.telegramId) return;

  const raw = (ctx.match as string)?.trim() ?? '';
  const payload = raw.toLowerCase();

  try {
    if (payload === 'login') {
      await generateLoginLink(ctx);
      return;
    }
    if (payload.startsWith('link_')) {
      const token = raw.slice(5).toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(token)) {
        await ctx.reply(t('telegram.linkIntentInvalid', ctx.lang));
        return;
      }
      await generateAccountLinkFlow(ctx, token);
      return;
    }
    await ctx.reply(t('telegram.welcome', ctx.lang));
    await generateAuthCode(ctx);
  } catch (error) {
    console.error('Error handling start command:', error);
  }
};

