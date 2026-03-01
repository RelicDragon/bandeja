import * as cron from 'node-cron';
import { UnreadAutoReadService } from './chat/unreadAutoRead.service';

export class UnreadAutoReadScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    const tz = process.env.TZ || 'local';
    console.log(`📬 Unread auto-read scheduler started (daily 04:00, TZ=${tz})`);
    this.cronJob = cron.schedule('0 4 * * *', () => this.run());
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    const maxAttempts = 2;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const created = await UnreadAutoReadService.markOldUnreadAsRead();
          if (created > 0) console.log(`📬 Unread auto-read: marked ${created} receipt(s) for messages older than 1 month`);
          return;
        } catch (err) {
          console.error(`Unread auto-read scheduler error (attempt ${attempt}/${maxAttempts}):`, err);
          if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 5000));
        }
      }
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Unread auto-read scheduler stopped');
    }
  }
}
