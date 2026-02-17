import * as cron from 'node-cron';
import { DraftService } from './chat/draft.service';

/**
 * Runs daily at 03:00. Set TZ=UTC (e.g. in env) for predictable expiry; otherwise uses server local time.
 * Uses an in-process lock so overlapping runs do not execute concurrently.
 */
export class DraftScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private expiryRunning = false;

  start() {
    const tz = process.env.TZ || 'local';
    console.log(`📝 Draft scheduler started (expiry daily 03:00, TZ=${tz})`);
    this.cronJob = cron.schedule('0 3 * * *', async () => {
      await  this.runExpiry();
    });
  }

  private async runExpiry() {
    if (this.expiryRunning) return;
    this.expiryRunning = true;
    const maxAttempts = 2;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const deleted = await DraftService.deleteDraftsOlderThan();
          if (deleted > 0) {
            console.log(`📝 Draft expiry: deleted ${deleted} draft(s)`);
          }
          return;
        } catch (error) {
          console.error(`Draft scheduler expiry error (attempt ${attempt}/${maxAttempts}):`, error);
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
      }
    } finally {
      this.expiryRunning = false;
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
