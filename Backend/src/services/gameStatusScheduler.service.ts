import * as cron from 'node-cron';
import prisma from '../config/database';
import { calculateGameStatus } from '../utils/gameStatus';
import { deleteInvitesForStartedGame, deleteInvitesForArchivedGame } from '../controllers/invite.controller';
import { EntityType } from '@prisma/client';
import { getUserTimezoneFromCityId } from './user-timezone.service';
import notificationService from './notification.service';
import { BarResultsService } from './barResults.service';

export class GameStatusScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private reminder24hSentGames: Set<string> = new Set();
  private reminder2hSentGames: Set<string> = new Set();

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
          entityType: true,
          cityId: true,
          timeIsSet: true,
        },
      });

      let updated = 0;
      for (const game of games) {
        if (!game.timeIsSet) {
          if (game.status !== 'ANNOUNCED') {
            await prisma.game.update({
              where: { id: game.id },
              data: { status: 'ANNOUNCED' },
            });
            updated++;
          }
          continue;
        }

        const cityTimezone = await getUserTimezoneFromCityId(game.cityId);
        const newStatus = calculateGameStatus(game, cityTimezone);
        
        if (newStatus !== game.status) {
          if (
            game.entityType === EntityType.LEAGUE_SEASON &&
            (newStatus === 'FINISHED' || newStatus === 'ARCHIVED')
          ) {
            continue;
          }

          const previousStatus = game.status;

          await prisma.game.update({
            where: { id: game.id },
            data: { status: newStatus },
          });
          updated++;

          // Handle BAR game completion
          if (game.entityType === EntityType.BAR && previousStatus !== 'FINISHED' && newStatus === 'FINISHED') {
            try {
              await BarResultsService.setBarResults(game.id);
            } catch (error) {
              console.error(`Failed to set bar results for game ${game.id}:`, error);
            }
          }

          // Delete invites when game status changes to STARTED
          if (newStatus === 'STARTED') {
            await deleteInvitesForStartedGame(game.id);
          }

          // Delete invites when game status changes to ARCHIVED
          if (newStatus === 'ARCHIVED') {
            await deleteInvitesForArchivedGame(game.id);
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
      const now = new Date();
      const WINDOW_MINUTES = 10;

      // 24 hours reminder window
      const twentyFourHoursMinusWindow = new Date(now.getTime() + (24 * 60 * 60 * 1000) - (WINDOW_MINUTES * 60 * 1000));
      const twentyFourHoursPlusWindow = new Date(now.getTime() + (24 * 60 * 60 * 1000) + (WINDOW_MINUTES * 60 * 1000));

      // 2 hours reminder window
      const twoHoursMinusWindow = new Date(now.getTime() + (2 * 60 * 60 * 1000) - (WINDOW_MINUTES * 60 * 1000));
      const twoHoursPlusWindow = new Date(now.getTime() + (2 * 60 * 60 * 1000) + (WINDOW_MINUTES * 60 * 1000));

      // Find games for 24h reminders
      const gamesFor24hReminder = await prisma.game.findMany({
        where: {
          status: 'ANNOUNCED',
          entityType: {
            in: [EntityType.GAME, EntityType.TOURNAMENT, EntityType.BAR, EntityType.TRAINING, EntityType.LEAGUE],
          },
          timeIsSet: true,
          startTime: {
            gte: twentyFourHoursMinusWindow,
            lte: twentyFourHoursPlusWindow,
          },
        },
        select: {
          id: true,
        },
      });

      // Find games for 2h reminders
      const gamesFor2hReminder = await prisma.game.findMany({
        where: {
          status: 'ANNOUNCED',
          entityType: {
            in: [EntityType.GAME, EntityType.TOURNAMENT, EntityType.BAR, EntityType.TRAINING, EntityType.LEAGUE],
          },
          timeIsSet: true,
          startTime: {
            gte: twoHoursMinusWindow,
            lte: twoHoursPlusWindow,
          },
        },
        select: {
          id: true,
        },
      });

      let remindersSent = 0;

      // Send 24h reminders
      for (const game of gamesFor24hReminder) {
        if (!this.reminder24hSentGames.has(game.id)) {
          try {
            await this.sendGameReminder(game.id, 24);
            this.reminder24hSentGames.add(game.id);
            remindersSent++;
          } catch (error) {
            console.error(`Failed to send 24h reminder for game ${game.id}:`, error);
          }
        }
      }

      // Send 2h reminders
      for (const game of gamesFor2hReminder) {
        if (!this.reminder2hSentGames.has(game.id)) {
          try {
            await this.sendGameReminder(game.id, 2);
            this.reminder2hSentGames.add(game.id);
            remindersSent++;
          } catch (error) {
            console.error(`Failed to send 2h reminder for game ${game.id}:`, error);
          }
        }
      }

      if (remindersSent > 0) {
        console.log(`📧 Sent ${remindersSent} reminder notifications`);
      }

      // Cleanup old games from tracking sets
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
        this.reminder24hSentGames.delete(game.id);
        this.reminder2hSentGames.delete(game.id);
      }
    } catch (error) {
      console.error('❌ Error sending reminders:', error);
    }
  }

  private async sendGameReminder(gameId: string, hoursBeforeStart: number) {
    const participants = await prisma.gameParticipant.findMany({
      where: {
        gameId,
        isPlaying: true,
      },
      include: {
        user: {
          select: {
            id: true,
            language: true,
            currentCityId: true,
          }
        }
      }
    });

    const recipients = participants.map(p => p.user);
    await notificationService.sendGameReminderNotification(gameId, recipients, hoursBeforeStart);
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Game status scheduler stopped');
    }
  }
}

