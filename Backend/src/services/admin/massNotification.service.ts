import prisma from '../../config/database';
import pushNotificationService from '../push/push-notification.service';
import telegramBotService from '../telegram/bot.service';
import { escapeMarkdown } from '../telegram/utils';
import { NotificationType } from '../../types/notifications.types';

const BANDEJA_BANK_IDENTIFIER = 'BANDEJA_BANK';

export class AdminMassNotificationService {
  static async sendMassNotification(title: string, text: string, cityId?: string) {
    if (!title?.trim() || !text?.trim()) {
      throw new Error('Title and text are required');
    }

    const whereClause: any = {
      isActive: true,
      OR: [
        { phone: null },
        { phone: { not: BANDEJA_BANK_IDENTIFIER } },
      ],
    };

    if (cityId) {
      whereClause.currentCityId = cityId;
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, telegramId: true },
    });

    const usersWithPush = await prisma.pushToken.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });
    const pushUserIds = new Set(usersWithPush.map((t) => t.userId));

    const bot = telegramBotService.getBot();
    const payload = {
      type: NotificationType.GAME_SYSTEM_MESSAGE,
      title: title.trim(),
      body: text.trim(),
    };

    const results = {
      totalUsers: users.length,
      pushSent: 0,
      telegramSent: 0,
      pushFailed: 0,
      telegramFailed: 0,
    };

    for (const user of users) {
      if (pushUserIds.has(user.id)) {
        try {
          const count = await pushNotificationService.sendNotificationToUser(user.id, payload);
          results.pushSent += count;
        } catch {
          results.pushFailed++;
        }
      }

      if (user.telegramId && bot) {
        try {
          const escapedTitle = escapeMarkdown(title.trim());
          const escapedText = escapeMarkdown(text.trim());
          await bot.api.sendMessage(user.telegramId, `*${escapedTitle}*\n\n${escapedText}`, {
            parse_mode: 'Markdown',
          });
          results.telegramSent++;
        } catch {
          results.telegramFailed++;
        }
      }
    }

    return results;
  }
}
