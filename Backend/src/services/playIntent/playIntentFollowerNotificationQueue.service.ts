import prisma from '../../config/database';
import type { PlayIntentFollowerNotificationJob } from '@prisma/client';
import { PlayIntentNotifyService } from './playIntentNotify.service';

const POLL_INTERVAL_MS = 5_000;
const STALE_RUNNING_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

let workerTimer: ReturnType<typeof setInterval> | null = null;
let draining = false;

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
      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          attempts: { decrement: 1 },
          runAfter: new Date(Date.now() + 2_000),
        },
      });
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
      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: {
          status: 'done',
          deliveredAt: delivered > 0 ? new Date() : null,
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = job.attempts >= MAX_ATTEMPTS;
      const retryDelay = Math.min(60_000, 2 ** job.attempts * 1_000);
      await prisma.playIntentFollowerNotificationJob.update({
        where: { id: job.id },
        data: {
          status: failed ? 'failed' : 'pending',
          runAfter: new Date(Date.now() + retryDelay),
          lastError: message.slice(0, 2_000),
        },
      });
    }
  }

  static async drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      await this.recoverStaleJobs();
      while (true) {
        const job = await this.claimNext();
        if (!job) break;
        await this.process(job);
      }
    } finally {
      draining = false;
    }
  }
}
