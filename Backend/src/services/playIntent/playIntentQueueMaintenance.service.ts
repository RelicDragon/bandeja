import { PlayIntentJobStatus } from '@prisma/client';
import prisma from '../../config/database';
import { reportPlayIntentQueueError } from './playIntentQueueFailure';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COMPLETED_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let cleaning = false;

export class PlayIntentQueueMaintenanceService {
  static start(): void {
    if (timer) return;
    timer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    void this.cleanup();
  }

  static stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  }

  static async cleanup(): Promise<void> {
    if (cleaning) return;
    cleaning = true;
    try {
      const completedBefore = new Date(Date.now() - COMPLETED_RETENTION_MS);
      const failedBefore = new Date(Date.now() - FAILED_RETENTION_MS);
      const completedStatuses = [
        PlayIntentJobStatus.done,
        PlayIntentJobStatus.skipped,
      ];
      await prisma.playIntentNotificationDelivery.deleteMany({
        where: {
          OR: [
            {
              status: { in: completedStatuses },
              updatedAt: { lt: completedBefore },
            },
            {
              status: PlayIntentJobStatus.failed,
              updatedAt: { lt: failedBefore },
            },
          ],
        },
      });
      await prisma.playIntentMatchJob.deleteMany({
        where: {
          OR: [
            {
              status: { in: completedStatuses },
              updatedAt: { lt: completedBefore },
            },
            {
              status: PlayIntentJobStatus.failed,
              updatedAt: { lt: failedBefore },
            },
          ],
        },
      });
      await prisma.playIntentFollowerNotificationJob.deleteMany({
        where: {
          OR: [
            {
              status: { in: completedStatuses },
              updatedAt: { lt: completedBefore },
            },
            {
              status: PlayIntentJobStatus.failed,
              updatedAt: { lt: failedBefore },
            },
          ],
        },
      });
    } catch (error) {
      reportPlayIntentQueueError(
        'play-intent-queue-maintenance',
        'cleanup failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      cleaning = false;
    }
  }
}
