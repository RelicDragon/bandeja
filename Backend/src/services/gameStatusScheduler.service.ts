import * as cron from 'node-cron';
import prisma from '../config/database';
import { calculateGameStatus } from '../utils/gameStatus';
import { deleteInvitesForStartedGame } from '../controllers/invite.controller';
import telegramBotService from './telegram/bot.service';
import { sendGameReminderNotification } from './telegram/notifications/game-reminder.notification';
import { EntityType } from '@prisma/client';

export class GameStatusScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private reminderSentGames: Set<string> = new Set();

  start() {
    console.log('🔄 Game status scheduler started (runs at :00 and :30 every hour)');
    
    // Run at :00 and :30 minutes every hour
    this.cronJob = cron.schedule('0,30 * * * *', async () => {
      await this.updateGameStatuses();
      await this.sendReminders();
    });

    // Run immediately on startup
    this.updateGameStatuses();
    this.sendReminders();
  }

  private async updateGameStatuses() {
    try {
      console.log('🔄 Updating game statuses...');
      
      const games = await prisma.game.findMany({
        where: {
          status: {
            not: 'ARCHIVED',
          },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          resultsStatus: true,
          status: true,
        },
      });

      let updated = 0;
      for (const game of games) {
        const newStatus = calculateGameStatus(game);
        
        if (newStatus !== game.status) {
          await prisma.game.update({
            where: { id: game.id },
            data: { status: newStatus },
          });
          updated++;

          // Delete invites when game status changes to STARTED
          if (newStatus === 'STARTED') {
            await deleteInvitesForStartedGame(game.id);
          }
        }
      }

      console.log(`✅ Updated ${updated} game statuses`);
    } catch (error) {
      console.error('❌ Error updating game statuses:', error);
    }
  }

  private async sendReminders() {
    try {
      const bot = telegramBotService.getBot();
      if (!bot) {
        return;
      }

      const now = new Date();
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const twoHoursFromNowPlus30Min = new Date(twoHoursFromNow.getTime() + 30 * 60 * 1000);

      const gamesToRemind = await prisma.game.findMany({
        where: {
          status: {
            not: 'ARCHIVED',
          },
          entityType: {
            in: [EntityType.GAME, EntityType.TOURNAMENT, EntityType.BAR, EntityType.TRAINING],
          },
          startTime: {
            gte: twoHoursFromNow,
            lte: twoHoursFromNowPlus30Min,
          },
        },
        select: {
          id: true,
        },
      });

      let remindersSent = 0;
      for (const game of gamesToRemind) {
        if (!this.reminderSentGames.has(game.id)) {
          try {
            await sendGameReminderNotification(bot.api, game.id);
            this.reminderSentGames.add(game.id);
            remindersSent++;
          } catch (error) {
            console.error(`Failed to send reminder for game ${game.id}:`, error);
          }
        }
      }

      if (remindersSent > 0) {
        console.log(`📧 Sent ${remindersSent} reminder notifications`);
      }

      const pastGames = await prisma.game.findMany({
        where: {
          startTime: {
            lt: new Date(now.getTime() - 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
        },
      });

      for (const game of pastGames) {
        this.reminderSentGames.delete(game.id);
      }
    } catch (error) {
      console.error('❌ Error sending reminders:', error);
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Game status scheduler stopped');
    }
  }
}

