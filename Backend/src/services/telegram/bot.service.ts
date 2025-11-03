import { Bot } from 'grammy';
import { config } from '../../config/env';
import { BotContext, PendingReply } from './types';
import { requireUser, requireChat } from './middleware';
import { handleStartCommand } from './commands/start.command';
import { generateAuthCode } from './commands/auth.command';
import { handleMyGamesCommand } from './commands/myGames.command';
import { createMessageHandler } from './handlers/message.handler';
import { createCallbackHandler } from './handlers/callback.handler';
import { startCleanupInterval } from './cleanup.service';
import { verifyCode } from './otp.service';
import telegramNotificationService from './notification.service';

class TelegramBotService {
  private bot: Bot | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private pendingReplies: Map<string, PendingReply> = new Map();

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

    this.bot.command('start', requireUser, requireChat, handleStartCommand);
    this.bot.command('auth', requireUser, requireChat, generateAuthCode);
    this.bot.command('my', requireUser, requireChat, handleMyGamesCommand);

    this.bot.on('message', requireUser, requireChat, createMessageHandler(this.pendingReplies, this.bot));

    this.bot.callbackQuery(/^(sg|rm|ia):/, requireUser, createCallbackHandler(this.pendingReplies));

    this.bot.catch((err) => {
      const ctx = err.ctx;
      console.error('Error in telegram bot:', err.error);
      
      ctx.answerCallbackQuery?.({ text: 'An error occurred', show_alert: true }).catch(() => {});
    });

    telegramNotificationService.initialize(this.bot);

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

