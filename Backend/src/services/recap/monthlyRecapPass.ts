import type { RecapOwnerRow } from './recapInputs.loader';
import type { MonthlyRecapPayload } from './recap.types';
import { isRecapGenerationDay, previousMonthKey } from './recapMonth';

/**
 * PRD 353 — one generation pass, with every side effect injected.
 *
 * Deliberately free of Prisma, the notification stack and `node-cron`: the day
 * window and the idempotency rule are the two things most likely to regress,
 * and they must be testable without a database or a `.env`.
 * `monthlyRecapScheduler.service.ts` supplies the production wiring.
 */

/** Users per eligibility page. Keeps the working set small on a large instance. */
export const RECAP_USER_BATCH_SIZE = 200;

export type MonthlyRecapRunStats = {
  monthKey: string;
  skippedOutsideWindow: boolean;
  considered: number;
  created: number;
  notified: number;
  failed: number;
  recapsPruned: number;
};

export type MonthlyRecapRunOptions = {
  /** Overrides "now" so a test can pin the day window. */
  now?: Date;
  /** Runs even outside the 1st–3rd window (admin backfill, tests). */
  force?: boolean;
  /** Defaults to the month that just ended. */
  monthKey?: string;
};

/**
 * One eligibility page.
 *
 * `nextCursor` is the last id the query **scanned**, not the last id it
 * returned, and `null` means "the scan is exhausted". The two are different for
 * the low-activity source, which reads `limit` rows and *then* drops anyone who
 * also played last month: it routinely hands back fewer ids than it scanned
 * while more pages remain, and taking the cursor from the filtered list makes
 * pages overlap. Terminating on a short *result* page is what silently dropped
 * every lapsed user sorting after the first page.
 */
export type RecapUserPage = {
  userIds: string[];
  nextCursor: string | null;
};

export type MonthlyRecapPassDeps = {
  findActiveUserIds: (
    monthKey: string,
    options: { cursor?: string; limit: number },
  ) => Promise<RecapUserPage>;
  findLowActivityUserIds: (
    monthKey: string,
    options: { cursor?: string; limit: number },
  ) => Promise<RecapUserPage>;
  loadOwner: (userId: string) => Promise<RecapOwnerRow | null>;
  generate: (
    owner: RecapOwnerRow,
    monthKey: string,
  ) => Promise<{ created: boolean; payload: MonthlyRecapPayload }>;
  notify: (options: {
    userId: string;
    monthKey: string;
    monthStart: string;
    language: string | null;
  }) => Promise<void>;
  prune: (now: Date) => Promise<{ recapsPruned: number }>;
  batchSize?: number;
};

/**
 * Walks one eligibility source page by page on an ascending-userId cursor.
 * A single user's failure is logged and skipped — one broken payload must never
 * cost everybody else their recap.
 */
async function sweep(
  deps: MonthlyRecapPassDeps,
  monthKey: string,
  stats: MonthlyRecapRunStats,
  page: (cursor: string | undefined) => Promise<RecapUserPage>,
): Promise<void> {
  let cursor: string | undefined;

  for (;;) {
    const { userIds, nextCursor } = await page(cursor);

    for (const userId of userIds) {
      stats.considered += 1;
      try {
        const owner = await deps.loadOwner(userId);
        if (!owner) continue;

        const outcome = await deps.generate(owner, monthKey);
        // A row already existed: this is a catch-up run on the 2nd or 3rd.
        // Staying silent here is what stops a second push.
        if (!outcome.created) continue;
        stats.created += 1;

        await deps.notify({
          userId,
          monthKey,
          monthStart: outcome.payload.monthStart,
          language: owner.language,
        });
        stats.notified += 1;
      } catch (err) {
        stats.failed += 1;
        console.error(`[MonthlyRecapScheduler] user ${userId} failed:`, err);
      }
    }

    // Exhaustion is what the *scan* reports, never the size of the filtered
    // page, and the cursor is the last id scanned so pages cannot overlap.
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
}

export async function runMonthlyRecapPass(
  deps: MonthlyRecapPassDeps,
  options: MonthlyRecapRunOptions = {},
): Promise<MonthlyRecapRunStats> {
  const now = options.now ?? new Date();
  const monthKey = options.monthKey ?? previousMonthKey(now);
  const batchSize = deps.batchSize ?? RECAP_USER_BATCH_SIZE;
  const stats: MonthlyRecapRunStats = {
    monthKey,
    skippedOutsideWindow: false,
    considered: 0,
    created: 0,
    notified: 0,
    failed: 0,
    recapsPruned: 0,
  };

  if (!options.force && !isRecapGenerationDay(now)) {
    stats.skippedOutsideWindow = true;
    return stats;
  }

  await sweep(deps, monthKey, stats, (cursor) =>
    deps.findActiveUserIds(monthKey, { cursor, limit: batchSize }),
  );
  await sweep(deps, monthKey, stats, (cursor) =>
    deps.findLowActivityUserIds(monthKey, { cursor, limit: batchSize }),
  );

  const pruned = await deps.prune(now);
  stats.recapsPruned = pruned.recapsPruned;
  return stats;
}
