import * as cron from 'node-cron';
import { pruneExpiredMonthlyRecaps } from '../story/story.prune.service';
import { generateMonthlyRecap } from './recap.service';
import {
  findLowActivityUserIdsForMonth,
  findUserIdsWithGamesInMonth,
  loadRecapOwner,
} from './recapInputs.loader';
import { sendMonthlyRecapReadyNotification } from './recapNotification';
import {
  runMonthlyRecapPass,
  type MonthlyRecapPassDeps,
  type MonthlyRecapRunOptions,
  type MonthlyRecapRunStats,
} from './monthlyRecapPass';

/**
 * PRD 353 — builds each user's `MonthlyRecap` for the month that just ended
 * and notifies them once it is ready.
 *
 * Cadence `0 4 1-3 * *` (CONTRACT §5.4): it runs on the 1st, 2nd and 3rd of the
 * month so a node that was down on the 1st still catches up.
 * `MonthlyRecap.@@unique([userId, monthKey])` is what makes the repeat runs
 * idempotent — never an in-memory Set. Only a pass that actually *created* a
 * row sends the push, so the 2nd and the 3rd are silent.
 *
 * Re-entrancy guarded like `PlayIntentScheduler`: a slow pass never overlaps
 * itself, and the cron callback never throws. The pass itself lives in
 * `monthlyRecapPass.ts` so it can be tested without a database.
 */

const productionDeps: MonthlyRecapPassDeps = {
  findActiveUserIds: findUserIdsWithGamesInMonth,
  findLowActivityUserIds: findLowActivityUserIdsForMonth,
  loadOwner: loadRecapOwner,
  generate: generateMonthlyRecap,
  notify: sendMonthlyRecapReadyNotification,
  prune: pruneExpiredMonthlyRecaps,
};

/**
 * One shared in-flight guard for the whole process, so the cron pass and an
 * admin backfill cannot run the same month twice at once.
 */
let passInFlight = false;

/**
 * A recap pass with the production dependencies, outside the scheduler
 * instance. The admin backfill endpoint needs this: the scheduler object lives
 * in `server.ts` and nothing else holds a reference to it.
 *
 * Returns `null` when a pass is already running.
 */
export async function runMonthlyRecapPassNow(
  options: MonthlyRecapRunOptions = {},
): Promise<MonthlyRecapRunStats | null> {
  if (passInFlight) return null;
  passInFlight = true;
  try {
    return await runMonthlyRecapPass(productionDeps, options);
  } finally {
    passInFlight = false;
  }
}

export class MonthlyRecapScheduler {
  private recapCron: cron.ScheduledTask | null = null;

  start() {
    this.recapCron = cron.schedule('0 4 1-3 * *', async () => {
      await this.runOnce();
    });

    console.log('📅 Monthly recap scheduler started (04:00 on the 1st–3rd)');
  }

  /** One full pass. Safe to call directly; concurrent calls are a no-op. */
  async runOnce(options: MonthlyRecapRunOptions = {}): Promise<MonthlyRecapRunStats | null> {
    try {
      return await runMonthlyRecapPassNow(options);
    } catch (err) {
      console.error('[MonthlyRecapScheduler] recap error:', err);
      return null;
    }
  }

  stop() {
    this.recapCron?.stop();
    this.recapCron = null;
    console.log('🛑 Monthly recap scheduler stopped');
  }
}
