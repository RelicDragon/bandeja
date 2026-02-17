import * as cron from 'node-cron';
import { DraftService } from './chat/draft.service';

export class DraftScheduler {
  private cronJob: cron.ScheduledTask | null = null;

  start() {
    console.log('📝 Draft scheduler started (expiry daily at 03:00)');
    this.cronJob = cron.schedule('0 3 * * *', async () => {
      await this.runExpiry();
    });
  }

  private async runExpiry() {
    try {
      await DraftService.deleteDraftsOlderThan();
    } catch (error) {
      console.error('Draft scheduler expiry error:', error);
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Draft scheduler stopped');
    }
  }
}
