import * as cron from 'node-cron';
import { config } from '../../config/env';
import { GameSeriesGenerationService } from './gameSeriesGeneration.service';

/**
 * PRD 345 — rolls a `GameSeries` forward: materialises occurrences inside the
 * series horizon, sends the "same time next week?" prompt and closes series
 * past their `endsOn`.
 *
 * Cadence `30 3 * * *` (CONTRACT §5.4). The PRD 345 agent also calls
 * {@link GameSeriesScheduler.runOnce} on series create / edit so a new series
 * does not wait for the nightly pass.
 *
 * Re-entrancy guarded like `PlayIntentScheduler`: a slow pass never overlaps
 * itself, and the cron callback never throws.
 */
export class GameSeriesScheduler {
  private rollCron: cron.ScheduledTask | null = null;
  private running = false;

  start() {
    this.rollCron = cron.schedule('30 3 * * *', async () => {
      await this.runOnce();
    });

    console.log('🔁 Game series scheduler started (roll forward: 03:30 daily)');
  }

  /**
   * One full pass. Safe to call directly (series create / edit) — the
   * re-entrancy guard makes a concurrent call a no-op rather than a double run.
   */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (!config.gameSeriesEnabled) return;

      // Order matters: close first so an expired series is never topped up.
      // Both steps are idempotent — `closeExpiredSeries` is an `updateMany`
      // filtered on `status = ACTIVE`, and occurrence creation dedupes on
      // `Game.@@unique([seriesId, seriesOccurrenceDate])`, never on an
      // in-memory Set (CONTRACT §5.4).
      const ended = await GameSeriesGenerationService.closeExpiredSeries();
      const rolled = await GameSeriesGenerationService.generateForAllActiveSeries();

      console.log(
        `[GameSeriesScheduler] rolled forward ${rolled.seriesCount} series ` +
          `(${rolled.createdCount} occurrences created, ${rolled.errorCount} errors, ` +
          `${ended} series ended)`,
      );
    } catch (err) {
      console.error('[GameSeriesScheduler] roll forward error:', err);
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.rollCron?.stop();
    this.rollCron = null;
    console.log('🛑 Game series scheduler stopped');
  }
}
