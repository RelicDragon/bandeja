import * as cron from 'node-cron';
import { Api } from 'grammy';
import prisma from '../../config/database';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { getGameInclude } from '../game/read.service';
import { buildGamesMessage } from './commands/games.command';
import { getUserLanguage } from './utils';
import telegramBotService from './bot.service';

export class TelegramGamesScheduler {
  private cronJob: cron.ScheduledTask | null = null;

  start() {
    console.log('🔄 Telegram games scheduler started (runs every 5 minutes)');
    
    this.cronJob = cron.schedule('*/5 * * * *', async () => {
      await this.updateCityPinnedMessages();
    });

    this.updateCityPinnedMessages();
  }

  private async updateCityPinnedMessages() {
    const bot = telegramBotService.getBot();
    if (!bot) {
      console.warn('⚠️  Telegram bot not available, skipping pinned messages update');
      return;
    }

    const api = bot.api;

    try {
      const cities = await prisma.city.findMany({
        where: {
          telegramGroupId: {
            not: null,
          },
          isActive: true,
        },
      });

      console.log(`🔄 Processing ${cities.length} cities with Telegram groups`);

      for (const city of cities) {
        try {
          await this.processCity(api, city);
        } catch (error) {
          console.error(`❌ Error processing city ${city.id} (${city.name}):`, error);
        }
      }
    } catch (error) {
      console.error('❌ Error updating city pinned messages:', error);
    }
  }

  private async processCity(api: Api, city: any) {
    if (!city.telegramGroupId) {
      return;
    }

    const chatId = city.telegramGroupId;
    const timezone = await getUserTimezoneFromCityId(city.id);
    const lang = getUserLanguage(city.telegramPinnedLanguage || 'en-US', undefined);

    const games = await prisma.game.findMany({
      where: {
        cityId: city.id,
        status: 'ANNOUNCED',
        isPublic: true,
      },
      include: getGameInclude() as any,
      orderBy: {
        startTime: 'asc',
      },
    });

    const message = await buildGamesMessage(city, games, timezone, lang, 4096);

    if (message) {
      if (city.telegramPinnedMessageId) {
        const messageId = parseInt(city.telegramPinnedMessageId);
        
        if (isNaN(messageId)) {
          console.warn(`⚠️  Invalid telegramPinnedMessageId for city ${city.id}, clearing and recreating`);
          await prisma.city.update({
            where: { id: city.id },
            data: { telegramPinnedMessageId: null },
          });
        } else {
          try {
            await api.editMessageText(
              chatId,
              messageId,
              message,
              { parse_mode: 'Markdown' }
            );
            return;
          } catch (error: any) {
            console.warn(`⚠️  Failed to edit pinned message for city ${city.id}, recreating:`, error.message);
            
            try {
              await api.unpinChatMessage(chatId, messageId);
            } catch (unpinError) {
              console.warn(`⚠️  Failed to unpin message for city ${city.id}:`, unpinError);
            }

            try {
              await api.deleteMessage(chatId, messageId);
            } catch (deleteError) {
              console.warn(`⚠️  Failed to delete message for city ${city.id}:`, deleteError);
            }

            await prisma.city.update({
              where: { id: city.id },
              data: { telegramPinnedMessageId: null },
            });
          }
        }
      }

      try {
        const sentMessage = await api.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
        try {
          await api.pinChatMessage(chatId, sentMessage.message_id);
          await prisma.city.update({
            where: { id: city.id },
            data: { telegramPinnedMessageId: sentMessage.message_id.toString() },
          });
        } catch (pinError) {
          console.warn(`⚠️  Failed to pin message for city ${city.id}:`, pinError);
          try {
            await api.deleteMessage(chatId, sentMessage.message_id);
          } catch (deleteError) {
            console.warn(`⚠️  Failed to delete unpinned message for city ${city.id}:`, deleteError);
          }
        }
      } catch (sendError) {
        console.error(`❌ Failed to send message for city ${city.id}:`, sendError);
      }
    } else {
      if (city.telegramPinnedMessageId) {
        const messageId = parseInt(city.telegramPinnedMessageId);
        
        if (!isNaN(messageId)) {
          try {
            await api.unpinChatMessage(chatId, messageId);
          } catch (unpinError) {
            console.warn(`⚠️  Failed to unpin message for city ${city.id}:`, unpinError);
          }

          try {
            await api.deleteMessage(chatId, messageId);
          } catch (deleteError) {
            console.warn(`⚠️  Failed to delete message for city ${city.id}:`, deleteError);
          }
        }

        await prisma.city.update({
          where: { id: city.id },
          data: { telegramPinnedMessageId: null },
        });
      }
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Telegram games scheduler stopped');
    }
  }
}

