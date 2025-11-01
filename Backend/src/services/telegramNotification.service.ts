import TelegramBot from 'node-telegram-bot-api';
import prisma from '../config/database';
import { config } from '../config/env';
import { ChatType } from '@prisma/client';
import { getDateLabel, formatDate, t } from '../utils/translations';

class TelegramNotificationService {
  private bot: TelegramBot | null = null;

  initialize(bot: TelegramBot | null) {
    this.bot = bot;
  }

  private formatDuration(startTime: Date, endTime: Date, lang: string = 'en'): string {
    const durationMs = endTime.getTime() - startTime.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    const hLabel = t('common.h', lang);
    const mLabel = t('common.m', lang);
    
    if (minutes === 0) return `${hours}${hLabel}`;
    return `${hours}${hLabel} ${minutes}${mLabel}`;
  }

  private escapeMarkdown(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  async sendGameChatNotification(message: any, game: any, sender: any) {
    if (!this.bot) return;

    const place = game.court?.club?.name || game.club?.name || 'Unknown location';
    const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
    const messageContent = message.content || '[Media]';

    const chatType = message.chatType as ChatType;
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId: game.id },
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            sendTelegramMessages: true,
            language: true,
          }
        }
      }
    });

    for (const participant of participants) {
      const user = participant.user;
      
      if (!user.telegramId || !user.sendTelegramMessages || user.id === sender.id) {
        continue;
      }

      let canSeeMessage = false;
      
      if (chatType === ChatType.PUBLIC) {
        canSeeMessage = true;
      } else if (chatType === ChatType.PRIVATE) {
        canSeeMessage = participant.isPlaying;
      } else if (chatType === ChatType.ADMINS) {
        canSeeMessage = participant.role === 'OWNER' || participant.role === 'ADMIN';
      }

      if (canSeeMessage) {
        try {
          const lang = user.language || 'en';
          const shortDate = getDateLabel(game.startTime, lang, false);
          const startTime = formatDate(game.startTime, 'HH:mm', lang);
          const duration = this.formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
          
          const formattedMessage = `📍 ${this.escapeMarkdown(place)} ${shortDate} ${startTime}, ${duration}\n👤 *${this.escapeMarkdown(senderName)}*: ${this.escapeMarkdown(messageContent)}`;
          
          await this.bot.sendMessage(user.telegramId, formattedMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to send Telegram notification to user ${user.id}:`, error);
        }
      }
    }
  }

  async sendBugChatNotification(message: any, bug: any, sender: any) {
    if (!this.bot) return;

    const bugText = bug.text || 'Bug';
    const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
    const messageContent = message.content || '[Media]';

    const formattedMessage = `🐛 ${this.escapeMarkdown(bugText)}\n👤 *${this.escapeMarkdown(senderName)}*: ${this.escapeMarkdown(messageContent)}`;

    const bugCreator = await prisma.user.findUnique({
      where: { id: bug.senderId },
      select: {
        id: true,
        telegramId: true,
        sendTelegramMessages: true,
      }
    });

    if (bugCreator && bugCreator.telegramId && bugCreator.sendTelegramMessages && bugCreator.id !== sender.id) {
      try {
        await this.bot.sendMessage(bugCreator.telegramId, formattedMessage, { parse_mode: 'Markdown' });
      } catch (error) {
        console.error(`Failed to send Telegram notification to bug creator ${bugCreator.id}:`, error);
      }
    }

    const admins = await prisma.user.findMany({
      where: {
        OR: [
          { isAdmin: true },
          { isTrainer: true }
        ],
        NOT: { id: sender.id },
        telegramId: { not: null },
        sendTelegramMessages: true,
      },
      select: {
        id: true,
        telegramId: true,
      }
    });

    for (const admin of admins) {
      if (admin.telegramId && admin.id !== bugCreator?.id) {
        try {
          await this.bot.sendMessage(admin.telegramId, formattedMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          console.error(`Failed to send Telegram notification to admin ${admin.id}:`, error);
        }
      }
    }
  }
}

export default new TelegramNotificationService();

