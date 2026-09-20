import * as cron from 'node-cron';
import { runCostShareReminderSweep } from './costShareReminder.service';

/**
 * PRD 348 — hourly sweep that reminds players about unconfirmed
 * `GameCostShare` rows after a finished game.
 *
 * Cadence `0 * * * *` (CONTRACT §5.4).
 *
 * Re-entrancy guarded like `PlayIntentScheduler`: a slow pass never overlaps
 * itself, and the cron callback never throws.
 */
export class CostShareReminderScheduler {
  private reminderCron: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    this.reminderCron = cron.schedule('0 * * * *', async () => {
      await this.runOnce();
    });

    console.log('💶 Cost share reminder scheduler started (hourly)');
  }

  /** One full pass. Safe to call directly; concurrent calls are a no-op. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await runCostShareReminderSweep();
      if (result.frozen > 0 || result.notifications > 0) {
        console.log(
          `💶 Cost share sweep: froze ${result.frozen}, reminded ${result.notifications} player(s) across ${result.remindedGames} game(s)`,
        );
      }
    } catch (err) {
      console.error('[CostShareReminderScheduler] reminder error:', err);
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.reminderCron?.stop();
    this.reminderCron = null;
    console.log('🛑 Cost share reminder scheduler stopped');
  }
}
