import prisma from '../../config/database';
import { isGameTextLocalizationGenerationEnabled } from './gameTextTranslationQueue.service';

export type GameTextTranslationReconcileStats = {
  generationEnabled: boolean;
  expiredLeasesRequeued: number;
  /** Stub — missing-job / new-locale backfill not implemented in Piece 3. */
  missingJobsDetected: number;
  terminalFailuresLeftUntouched: number;
};

/**
 * Restart / missed-wakeup recovery helper.
 * Requeues expired leases only. Never resets terminal `failed` / `superseded` / `done`.
 */
export async function reconcileGameTextTranslationJobs(): Promise<GameTextTranslationReconcileStats> {
  const generationEnabled = isGameTextLocalizationGenerationEnabled();
  const now = new Date();

  const expired = await prisma.gameTextTranslationJob.updateMany({
    where: {
      status: 'running',
      leaseExpiresAt: { lt: now },
    },
    data: {
      status: 'pending',
      leaseOwner: null,
      leaseExpiresAt: null,
      // Keep attempts/errorCategory so retries remain finite.
      runAfter: now,
    },
  });

  const terminalFailuresLeftUntouched = await prisma.gameTextTranslationJob.count({
    where: { status: 'failed' },
  });

  if (!generationEnabled) {
    return {
      generationEnabled,
      expiredLeasesRequeued: expired.count,
      missingJobsDetected: 0,
      terminalFailuresLeftUntouched,
    };
  }

  // Piece 3 stub: do not invent missing jobs yet (backfill is a later slice).
  return {
    generationEnabled,
    expiredLeasesRequeued: expired.count,
    missingJobsDetected: 0,
    terminalFailuresLeftUntouched,
  };
}
