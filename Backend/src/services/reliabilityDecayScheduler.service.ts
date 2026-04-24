import * as cron from 'node-cron';
import { runReliabilityIdleDecay } from './reliabilityDecay.service';

export class ReliabilityDecayScheduler {
  private cronJob: cron.ScheduledTask | null = null;
  private running = false;

  start(): void {
    if (process.env.RELIABILITY_IDLE_DECAY_DISABLED === 'true') return;
    const tz = process.env.TZ || 'local';
    console.log(`📉 Reliability idle decay scheduler (daily 04:15, TZ=${tz})`);
    this.cronJob = cron.schedule('15 4 * * *', () => void this.run());
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const maxAttempts = 2;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const n = await runReliabilityIdleDecay();
          if (n > 0) console.log(`📉 Reliability idle decay: updated ${n} user(s)`);
          return;
        } catch (err) {
          console.error(`Reliability idle decay error (attempt ${attempt}/${maxAttempts}):`, err);
          if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 5000));
        }
      }
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Reliability idle decay scheduler stopped');
    }
  }
}
