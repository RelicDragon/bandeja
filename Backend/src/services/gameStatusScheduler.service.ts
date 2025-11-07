import * as cron from 'node-cron';
import prisma from '../config/database';
import { calculateGameStatus } from '../utils/gameStatus';
import { deleteInvitesForStartedGame } from '../controllers/invite.controller';

export class GameStatusScheduler {
  private cronJob: cron.ScheduledTask | null = null;

  start() {
    console.log('🔄 Game status scheduler started (runs at :00 and :30 every hour)');
    
    // Run at :00 and :30 minutes every hour
    this.cronJob = cron.schedule('0,30 * * * *', async () => {
      await this.updateGameStatuses();
    });

    // Run immediately on startup
    this.updateGameStatuses();
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

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Game status scheduler stopped');
    }
  }
}

