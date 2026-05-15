import { TranslationJobPriority, TranslationJobSource } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { isRedisConfigured } from '../redis/redisClient';
import { TranslationService } from './translation.service';
import { MESSAGE_TRANSLATION_PENDING } from './translationPending';
import { TranslationQueueRedis } from './translationQueueRedis.service';

const PRIORITY_ORDER: Record<TranslationJobPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

let workerTimer: ReturnType<typeof setInterval> | null = null;
let activeWorkers = 0;

export type TranslationQueueStats = {
  pending: number;
  running: number;
  done: number;
  failed: number;
  bySource: Record<TranslationJobSource, number>;
  recentFailed: Array<{
    messageId: string;
    languageCode: string;
    lastError: string | null;
    updatedAt: Date;
  }>;
  worker: { active: number; maxConcurrency: number };
  redis: { configured: boolean };
};

export class TranslationQueueService {
  static getActiveWorkerCount(): number {
    return activeWorkers;
  }

  static async getStats(): Promise<TranslationQueueStats> {
    const [pending, running, done, failed, bySourceRows, recentFailed] =
      await Promise.all([
        prisma.translationJob.count({ where: { status: 'pending' } }),
        prisma.translationJob.count({ where: { status: 'running' } }),
        prisma.translationJob.count({ where: { status: 'done' } }),
        prisma.translationJob.count({ where: { status: 'failed' } }),
        prisma.translationJob.groupBy({
          by: ['source'],
          where: { status: { in: ['pending', 'running'] } },
          _count: { _all: true },
        }),
        prisma.translationJob.findMany({
          where: { status: 'failed' },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            messageId: true,
            languageCode: true,
            lastError: true,
            updatedAt: true,
          },
        }),
      ]);

    const bySource: Record<TranslationJobSource, number> = {
      auto: 0,
      manual: 0,
      backfill: 0,
    };
    for (const row of bySourceRows) {
      bySource[row.source] = row._count._all;
    }

    return {
      pending,
      running,
      done,
      failed,
      bySource,
      recentFailed,
      worker: {
        active: activeWorkers,
        maxConcurrency: config.translationQueue.concurrency,
      },
      redis: { configured: isRedisConfigured() },
    };
  }
  static async enqueue(params: {
    messageId: string;
    languageCode: string;
    userId: string;
    priority?: TranslationJobPriority;
    source?: TranslationJobSource;
  }): Promise<void> {
    const languageCode = params.languageCode.toLowerCase();
    const message = await prisma.chatMessage.findUnique({
      where: { id: params.messageId },
      select: { id: true, senderId: true, content: true, messageType: true },
    });
    if (!message) return;

    const createdBy = params.userId || message.senderId || params.userId;

    await prisma.messageTranslation.upsert({
      where: {
        messageId_languageCode: {
          messageId: params.messageId,
          languageCode,
        },
      },
      create: {
        messageId: params.messageId,
        languageCode,
        translation: MESSAGE_TRANSLATION_PENDING,
        createdBy,
      },
      update: {},
    });

    const existing = await prisma.messageTranslation.findUnique({
      where: {
        messageId_languageCode: { messageId: params.messageId, languageCode },
      },
    });
    if (existing && existing.translation !== MESSAGE_TRANSLATION_PENDING) {
      return;
    }

    const requestedPriority = params.priority ?? 'normal';
    const existingJob = await prisma.translationJob.findUnique({
      where: {
        messageId_languageCode: {
          messageId: params.messageId,
          languageCode,
        },
      },
    });
    const priority =
      existingJob &&
      PRIORITY_ORDER[existingJob.priority] < PRIORITY_ORDER[requestedPriority]
        ? existingJob.priority
        : requestedPriority;

    await prisma.translationJob.upsert({
      where: {
        messageId_languageCode: {
          messageId: params.messageId,
          languageCode,
        },
      },
      create: {
        messageId: params.messageId,
        languageCode,
        priority,
        source: params.source ?? 'auto',
        status: 'pending',
        runAfter: new Date(),
      },
      update: {
        priority,
        source: params.source ?? 'auto',
        status: 'pending',
        runAfter: new Date(),
        attempts: 0,
        lastError: null,
      },
    });

    void TranslationQueueRedis.publishWake();
    void this.drain();
  }

  static async cancelJobsForMessage(messageId: string): Promise<void> {
    await prisma.translationJob.deleteMany({
      where: { messageId, status: { in: ['pending', 'failed'] } },
    });
  }

  static startWorker(): void {
    if (workerTimer) return;
    const intervalMs = config.translationQueue.pollIntervalMs;
    workerTimer = setInterval(() => {
      void this.drain();
    }, intervalMs);
    void TranslationQueueRedis.startWakeListener(() => {
      void this.drain();
    });
    void this.drain();
  }

  static stopWorker(): void {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
  }

  static async drain(): Promise<void> {
    const maxConcurrency = config.translationQueue.concurrency;
    while (activeWorkers < maxConcurrency) {
      const job = await this.claimNextJob();
      if (!job) break;
      activeWorkers += 1;
      void this.runJob(job.id).finally(() => {
        activeWorkers -= 1;
      });
      if (config.translationQueue.minIntervalMs > 0) {
        await new Promise((r) =>
          setTimeout(r, config.translationQueue.minIntervalMs)
        );
      }
    }
  }

  private static async claimNextJob(): Promise<{ id: string } | null> {
    const staleBefore = new Date(Date.now() - config.translationQueue.staleRunningMs);
    await prisma.translationJob.updateMany({
      where: { status: 'running', updatedAt: { lt: staleBefore } },
      data: { status: 'pending' },
    });

    const pending = await prisma.translationJob.findMany({
      where: {
        status: 'pending',
        runAfter: { lte: new Date() },
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });
    pending.sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    );
    const pick = pending[0];
    if (!pick) return null;

    const updated = await prisma.translationJob.updateMany({
      where: { id: pick.id, status: 'pending' },
      data: { status: 'running', updatedAt: new Date() },
    });
    if (updated.count !== 1) return null;

    const lockTtlSec = Math.max(60, Math.ceil(config.translationQueue.staleRunningMs / 1000));
    const locked = await TranslationQueueRedis.tryAcquireClaimLock(pick.id, lockTtlSec);
    if (!locked) {
      await prisma.translationJob.updateMany({
        where: { id: pick.id, status: 'running' },
        data: { status: 'pending' },
      });
      return null;
    }

    return { id: pick.id };
  }

  private static async runJob(jobId: string): Promise<void> {
    const job = await prisma.translationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'running') return;

    try {
      await TranslationService.executeQueuedTranslation(
        job.messageId,
        job.languageCode,
        job.source === 'manual' ? 'high' : job.source
      );
      await prisma.translationJob.update({
        where: { id: jobId },
        data: { status: 'done', lastError: null },
      });
    } catch (err: unknown) {
      const attempts = job.attempts + 1;
      const msg = err instanceof Error ? err.message : String(err);
      const maxAttempts = config.translationQueue.maxAttempts;
      if (attempts >= maxAttempts) {
        await prisma.translationJob.update({
          where: { id: jobId },
          data: { status: 'failed', attempts, lastError: msg },
        });
        await prisma.messageTranslation.deleteMany({
          where: {
            messageId: job.messageId,
            languageCode: job.languageCode,
            translation: MESSAGE_TRANSLATION_PENDING,
          },
        });
      } else {
        const delay = Math.min(60_000, 1000 * 2 ** attempts);
        await prisma.translationJob.update({
          where: { id: jobId },
          data: {
            status: 'pending',
            attempts,
            lastError: msg,
            runAfter: new Date(Date.now() + delay),
          },
        });
      }
    } finally {
      await TranslationQueueRedis.releaseClaimLock(jobId);
    }
  }
}
