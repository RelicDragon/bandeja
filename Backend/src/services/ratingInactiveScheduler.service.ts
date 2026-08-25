import * as cron from 'node-cron';
import { refreshAgedSportProfileInactive } from './ranking/sportProfileInactive.service';

export class RatingInactiveScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    const tz = process.env.TZ || 'local';
    console.log(`📉 Rating inactive scheduler started (daily 04:20, TZ=${tz})`);
    this.cronJob = cron.schedule('20 4 * * *', () => void this.run());
    void this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const updated = await refreshAgedSportProfileInactive();
      if (updated > 0) {
        console.log(`📉 Rating inactive: updated ${updated} sport profile(s)`);
      }
    } catch (error) {
      console.error('Rating inactive scheduler error:', error);
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Rating inactive scheduler stopped');
    }
  }
}
