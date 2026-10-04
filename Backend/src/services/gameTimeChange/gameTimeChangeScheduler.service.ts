import * as cron from 'node-cron';
import { runTimeChangeNoticeSweep } from './gameTimeChange.service';

/**
 * Time change — delivers "time changed" notices whose quiet
 * window has closed. Every 20 s, so a notice lands within ~80 s of the last
 * edit (60 s quiet window + one tick). Claims are durable and versioned, so a
 * restart or a second instance never double-sends; a slow pass never overlaps
 * itself, and the cron callback never throws.
 */
export class GameTimeChangeScheduler {
  private task: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    this.task = cron.schedule('*/20 * * * * *', async () => {
      await this.runOnce();
    });
    console.log('🕒 Game time change notice scheduler started (every 20 s)');
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await runTimeChangeNoticeSweep();
      if (result.claimed > 0) {
        console.log(
          `🕒 Time change sweep: claimed ${result.claimed}, sent ${result.sent}, skipped ${JSON.stringify(result.skipped)}`,
        );
      }
    } catch (err) {
      console.error('[GameTimeChangeScheduler] sweep error:', err);
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.task?.stop();
    this.task = null;
    console.log('🛑 Game time change notice scheduler stopped');
  }
}
