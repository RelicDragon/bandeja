import prisma from '../../config/database';
import type { PlayIntentFollowerNotificationJob } from '@prisma/client';
import { NotificationType } from '../../types/notifications.types';
import { PlayIntentNotifyService } from './playIntentNotify.service';
import { PlayIntentNotificationDeliveryQueueService } from './playIntentNotificationDeliveryQueue.service';
import { reportPlayIntentQueueError } from './playIntentQueueFailure';
import { PlayIntentDrainCoordinator } from './playIntentDrainCoordinator';

const POLL_INTERVAL_MS = 5_000;
const STALE_RUNNING_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000;

let workerTimer: ReturnType<typeof setInterval> | null = null;
const drainCoordinator = new PlayIntentDrainCoordinator();

export class PlayIntentFollowerNotificationQueueService {
  static startWorker(): void {
    if (workerTimer) return;
    workerTimer = setInterval(() => void this.drain(), POLL_INTERVAL_MS);
    void this.drain();
  }

  static stopWorker(): void {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  }

  private static async recoverStaleJobs(): Promise<void> {
    await prisma.playIntentFollowerNotificationJob.updateMany({
      where: {
        status: 'running',
        updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
      },
      data: { status: 'pending', runAfter: new Date() },
    });
  }

  private static async claimNext() {
    const candidate = await prisma.playIntentFollowerNotificationJob.findFirst({
      where: { status: 'pending', runAfter: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return null;

    const claimed = await prisma.playIntentFollowerNotificationJob.updateMany({
      where: { id: candidate.id, status: 'pending' },
      data: { status: 'running', attempts: { increment: 1 } },
    });
    return claimed.count === 1
      ? prisma.playIntentFollowerNotificationJob.findUnique({
          where: { id: candidate.id },
        })
      : null;
  }

  private static async deferWithoutConsumingAttempt(
    job: PlayIntentFollowerNotificationJob,
    runAfter: Date,
    lastError: string,
  ): Promise<void> {
    await prisma.playIntentFollowerNotificationJob.update({
      where: { id: job.id },
      data: {
        status: 'pending',
        attempts: { decrement: 1 },
        runAfter,
        lastError: lastError.slice(0, 2_000),
      },
    });
  }

  private static async process(job: PlayIntentFollowerNotificationJob) {
    const earlierUnfinished =
      await prisma.playIntentFollowerNotificationJob.findFirst({
        where: {
          id: { not: job.id },
          userId: job.userId,
          cityId: job.cityId,
          createdAt: { lt: job.createdAt },
          status: { in: ['pending', 'running'] },
        },
        select: { id: true },
      });
    if (earlierUnfinished) {
      await this.deferWithoutConsumingAttempt(
        job,
        new Date(Date.now() + 2_000),
        'waiting_for_earlier_fanout',
      );
      return;
    }

    const priorDelivery = await prisma.playIntentFollowerNotificationJob.findFirst({
      where: {
        id: { not: job.id },
        userId: job.userId,
        cityId: job.cityId,
        createdAt: { lt: job.createdAt },
        deliveredAt: {
          gte: new Date(job.createdAt.getTime() - COOLDOWN_MS),
        },
      },
      select: { id: true },
    });
    if (priorDelivery) {
      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: { status: 'done', lastError: null },
      });
      return;
    }

    try {
      const delivered = await PlayIntentNotifyService.notifyFollowers(job.intentId);
      if (delivered < 0) {
        throw new Error('follower notification delivery incomplete');
      }
      await PlayIntentNotificationDeliveryQueueService.drain();

      const confirmedDeliveries =
        await prisma.playIntentNotificationDelivery.count({
          where: {
            sourceId: job.intentId,
            notificationType: NotificationType.FOLLOWED_USER_PLAY_INTENT,
            status: 'done',
            deliveredAt: { not: null },
          },
        });
      const unfinishedDelivery =
        await prisma.playIntentNotificationDelivery.findFirst({
          where: {
            sourceId: job.intentId,
            notificationType: NotificationType.FOLLOWED_USER_PLAY_INTENT,
            status: { in: ['pending', 'running'] },
          },
          select: { runAfter: true, status: true },
          orderBy: { runAfter: 'asc' },
        });
      if (unfinishedDelivery) {
        // Child delivery owns retries; do not burn parent fanout attempts.
        const waitUntil = Math.max(
          Date.now() + 2_000,
          unfinishedDelivery.runAfter.getTime(),
        );
        await this.deferWithoutConsumingAttempt(
          job,
          new Date(waitUntil),
          'waiting_for_delivery_queue',
        );
        return;
      }

      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: {
          status: 'done',
          deliveredAt: confirmedDeliveries > 0 ? new Date() : null,
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = job.attempts >= MAX_ATTEMPTS;
      const retryDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        2 ** job.attempts * 1_000,
      );
      const confirmedDeliveries =
        await prisma.playIntentNotificationDelivery.count({
          where: {
            sourceId: job.intentId,
            notificationType: NotificationType.FOLLOWED_USER_PLAY_INTENT,
            status: 'done',
            deliveredAt: { not: null },
          },
        });
      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: {
          status: failed ? 'failed' : 'pending',
          runAfter: new Date(Date.now() + retryDelay),
          deliveredAt:
            confirmedDeliveries > 0 ? job.deliveredAt ?? new Date() : undefined,
          lastError: message.slice(0, 2_000),
        },
      });
      if (failed) {
        reportPlayIntentQueueError(
          'play-intent-follower-fanout',
          `job ${job.id} exhausted retries`,
          message,
        );
      }
    }
  }

  static drain(): Promise<void> {
    return drainCoordinator.run(async () => {
      try {
        await this.recoverStaleJobs();
        while (true) {
          const job = await this.claimNext();
          if (!job) break;
          await this.process(job);
        }
      } catch (error) {
        reportPlayIntentQueueError(
          'play-intent-follower-fanout',
          'drain failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }
}
