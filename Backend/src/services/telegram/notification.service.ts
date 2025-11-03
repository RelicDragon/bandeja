import { Bot } from 'grammy';
import { sendGameChatNotification } from './notifications/game-chat.notification';
import { sendBugChatNotification } from './notifications/bug-chat.notification';
import { sendInviteNotification } from './notifications/invite.notification';
import { sendGameCard } from './notifications/game-card.notification';

class TelegramNotificationService {
  private bot: Bot | null = null;

  initialize(bot: Bot | null) {
    this.bot = bot;
  }

  async sendGameChatNotification(message: any, game: any, sender: any) {
    if (!this.bot) return;
    await sendGameChatNotification(this.bot.api, message, game, sender);
  }

  async sendBugChatNotification(message: any, bug: any, sender: any) {
    if (!this.bot) return;
    await sendBugChatNotification(this.bot.api, message, bug, sender);
  }

  async sendInviteNotification(invite: any) {
    if (!this.bot) return;
    await sendInviteNotification(this.bot.api, invite);
  }

  async sendGameCard(gameId: string, telegramId: string, lang: string = 'en', botApi?: any) {
    const api = botApi || this.bot?.api;
    if (!api) {
      throw new Error('Bot API not available');
    }
    await sendGameCard(api, gameId, telegramId, lang);
  }
}

export default new TelegramNotificationService();

