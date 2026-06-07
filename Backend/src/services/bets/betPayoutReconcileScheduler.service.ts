import * as cron from 'node-cron';
import { reconcileUnresolvedBetPayouts } from './betResolutionPayout.service';

export class BetPayoutReconcileScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start(): void {
    if (process.env.BET_PAYOUT_RECONCILE_DISABLED === 'true') return;
    const tz = process.env.TZ || 'local';
    console.log(`🪙 Bet payout reconcile scheduler (every 5 min, TZ=${tz})`);
    this.cronJob = cron.schedule('*/5 * * * *', () => void this.run());
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { retried, failed } = await reconcileUnresolvedBetPayouts();
      if (retried > 0 || failed > 0) {
        console.log(`🪙 Bet payout reconcile: retried=${retried} failed=${failed}`);
      }
    } catch (err) {
      console.error('Bet payout reconcile scheduler error:', err);
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Bet payout reconcile scheduler stopped');
    }
  }
}
