import * as cron from 'node-cron';
import { PushReplyTokenService } from './pushReplyToken.service';

export class PushReplyTokenCleanupScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start(): void {
    const tz = process.env.TZ || 'local';
    console.log(`🔑 Push reply token cleanup scheduler started (daily 05:15, TZ=${tz})`);
    this.cronJob = cron.schedule('15 5 * * *', () => void this.run());
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const removed = await PushReplyTokenService.purgeExpired();
      if (removed > 0) {
        console.log(`[push-reply] purged ${removed} expired token(s)`);
      }
    } catch (error) {
      console.error('Push reply token cleanup scheduler error:', error);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }
}
