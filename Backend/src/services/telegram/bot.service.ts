import { Bot } from 'grammy';
import type { TelegramOtp } from '@prisma/client';
import { config } from '../../config/env';
import { PendingTelegramInput } from './types';
import { requireUser, requireChat, requirePrivateChat, syncTelegramProfile, rateLimitChat } from './middleware';
import { handleStartCommand } from './commands/start.command';
import { generateAuthCode } from './commands/auth.command';
import { generateLoginLink } from './commands/login.command';
import { handleMyGamesCommand } from './commands/myGames.command';
import { handleGamesCommand } from './commands/games.command';
import { handlePlayCommand } from './commands/play.command';
import { handleLiveCommand } from './commands/live.command';
import { handleInviteCommand } from './commands/invite.command';
import { registerBotCommandMenu } from './botCommandMenu';
import { createMessageHandler } from './handlers/message.handler';
import { createCallbackHandler } from './handlers/callback.handler';
import { startCleanupInterval } from './cleanup.service';
import { consumeTelegramOtp, verifyCode, verifyLinkKey } from './otp.service';
import telegramNotificationService from './notification.service';
import telegramResultsSenderService from './resultsSender.service';
import { t } from '../../utils/translations';

class TelegramBotService {
  private bot: Bot | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private pendingReplies: Map<string, PendingTelegramInput> = new Map();

  getBot(): Bot | null {
    return this.bot;
  }

  async initialize() {
    if (!config.telegramBotToken) {
      console.warn('⚠️  Telegram bot token not configured');
      return;
    }

    this.bot = new Bot(config.telegramBotToken);

    try {
      const me = await this.bot.api.getMe();
      this.bot.botInfo = me;
    } catch (error) {
      console.error('Failed to fetch bot info:', error);
    }

    this.bot.command('start', requireUser, syncTelegramProfile, requirePrivateChat, handleStartCommand);
    this.bot.command('auth', requireUser, syncTelegramProfile, requirePrivateChat, generateAuthCode);
    this.bot.command('login', requireUser, syncTelegramProfile, requirePrivateChat, generateLoginLink);
    this.bot.command('my', requireUser, syncTelegramProfile, requirePrivateChat, handleMyGamesCommand);
    this.bot.command('games', requireUser, syncTelegramProfile, requireChat, handleGamesCommand);
    // PRD 356 — both work in private and group chats, rate limited per chat.
    this.bot.command('play', requireUser, syncTelegramProfile, requireChat, rateLimitChat(), handlePlayCommand);
    this.bot.command('live', requireUser, syncTelegramProfile, requireChat, rateLimitChat(), handleLiveCommand);
    // PRD 351 — personal referral link. Private chat only: the reply contains a
    // link tied to one account, which must not be posted into a group.
    this.bot.command('invite', requireUser, syncTelegramProfile, requirePrivateChat, handleInviteCommand);

    this.bot.on('message', requireUser, syncTelegramProfile, requirePrivateChat, createMessageHandler(this.pendingReplies, this.bot));

    // Every colon-delimited callback prefix handled by `handlers/callback.handler.ts`
    // must be listed here or its buttons silently do nothing (CONTRACT §5.3).
    // uti = user-team invite, sip = play-intent proposal, at = attendance (PRD 346),
    // sr = series next occurrence (PRD 345), wx = weather alert (PRD 357),
    // pi = play-intent bot flow (PRD 356).
    this.bot.callbackQuery(/^(sg|rm|ia|rum|rg|rbm|uti|sip|at|sr|wx|pi):/, requireUser, syncTelegramProfile, createCallbackHandler(this.pendingReplies));

    this.bot.catch((err) => {
      const ctx = err.ctx as any;
      console.error('Error in telegram bot:', err.error);
      
      if (ctx.callbackQuery) {
        ctx.answerCallbackQuery?.({ text: 'An error occurred', show_alert: true }).catch(() => {});
      } else {
        const lang = ctx.lang || (ctx.from?.language_code ? ctx.from.language_code.split('-')[0] : 'en');
        ctx.reply(t('telegram.authError', lang) || 'An error occurred. Please try again.').catch(() => {});
      }
    });

    telegramNotificationService.initialize(this.bot);
    telegramResultsSenderService.initialize(this.bot);

    // PRD 356 — the "/" menu. Never blocks startup: a Telegram API hiccup here
    // must not stop the bot from answering messages.
    void registerBotCommandMenu(this.bot);

    try {
      console.log('Starting bot');
      this.bot.start();
      console.log('✅ Bot started (long polling)');
      console.log('Starting cleaning interval');
      this.cleanupInterval = startCleanupInterval(this.bot);
      console.log('🤖 Telegram bot initialized');
    } catch (error) {
      console.error('❌ Failed to start Telegram bot:', error);
      throw error;
    }
  }

  async verifyCode(code: string) {
    return verifyCode(code, this.bot);
  }

  async verifyLinkKey(key: string, options?: { consume?: boolean }) {
    return verifyLinkKey(key, this.bot, options);
  }

  async consumeTelegramOtp(otp: TelegramOtp) {
    return consumeTelegramOtp(otp, this.bot);
  }

  stop() {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.bot) {
      this.bot.stop();
    }
  }
}

export default new TelegramBotService();
