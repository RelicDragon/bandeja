import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { GameTextTranslationJob } from '@prisma/client';
import prisma from '../../config/database';
import { config, isGameTextLocalizationGenerationEnabled } from '../../config/env';
import { isRedisConfigured } from '../redis/redisClient';
import {
  categorizeUnknownError,
  errorMessage,
  GameTextTranslationError,
} from './gameTextTranslationErrors';
import { publishGameTextInvalidation } from './gameTextRealtime';
import { publishGameTextTranslationResult } from './gameTextTranslationPublish.service';
import { GameTextTranslationQueueRedis } from './gameTextTranslationQueueRedis.service';
import {
  translateGameText,
  type GameTextFieldKey,
} from './gameTextTranslator.service';

let workerTimer: ReturnType<typeof setInterval> | null = null;
let activeWorkers = 0;
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

export type GameTextTranslationQueueStats = {
  generationEnabled: boolean;
  pending: number;
  running: number;
  done: number;
  failed: number;
  superseded: number;
  worker: { active: number; maxConcurrency: number; workerId: string };
  redis: { configured: boolean };
};

export { isGameTextLocalizationGenerationEnabled };

function backoffMs(attempts: number): number {
  const base = Math.min(60_000, 1000 * 2 ** attempts);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.25)));
  return base + jitter;
}

export type ClaimedGameTextJob = {
  id: string;
  claimToken: bigint;
  leaseOwner: string;
  job: GameTextTranslationJob;
};

export class GameTextTranslationQueueService {
  static getWorkerId(): string {
    return workerId;
  }

  static getActiveWorkerCount(): number {
    return activeWorkers;
  }

  static async getStats(): Promise<GameTextTranslationQueueStats> {
    const [pending, running, done, failed, superseded] = await Promise.all([
      prisma.gameTextTranslationJob.count({ where: { status: 'pending' } }),
      prisma.gameTextTranslationJob.count({ where: { status: 'running' } }),
      prisma.gameTextTranslationJob.count({ where: { status: 'done' } }),
      prisma.gameTextTranslationJob.count({ where: { status: 'failed' } }),
      prisma.gameTextTranslationJob.count({ where: { status: 'superseded' } }),
    ]);
    return {
      generationEnabled: isGameTextLocalizationGenerationEnabled(),
      pending,
      running,
      done,
      failed,
      superseded,
      worker: {
        active: activeWorkers,
        maxConcurrency: config.gameTextTranslationQueue.concurrency,
        workerId,
      },
      redis: { configured: isRedisConfigured() },
    };
  }

  static wake(): void {
    void GameTextTranslationQueueRedis.publishWake();
    void this.drain();
  }

  static startWorker(): void {
    if (workerTimer) return;
    const intervalMs = config.gameTextTranslationQueue.pollIntervalMs;
    workerTimer = setInterval(() => {
      void this.drain();
    }, intervalMs);
    void GameTextTranslationQueueRedis.startWakeListener(() => {
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
    if (!isGameTextLocalizationGenerationEnabled()) {
      return;
    }
    const maxConcurrency = config.gameTextTranslationQueue.concurrency;
    while (activeWorkers < maxConcurrency) {
      const claimed = await this.claimNextJob();
      if (!claimed) break;
      activeWorkers += 1;
      void this.runClaimedJob(claimed).finally(() => {
        activeWorkers -= 1;
      });
      if (config.gameTextTranslationQueue.minIntervalMs > 0) {
        await new Promise((r) =>
          setTimeout(r, config.gameTextTranslationQueue.minIntervalMs),
        );
      }
    }
  }

  /**
   * Atomic claim: only succeeds when status is pending (due) or running with expired lease,
   * and claimToken still matches the candidate row. Increments fencing token on success.
   */
  static async claimNextJob(): Promise<ClaimedGameTextJob | null> {
    const now = new Date();
    const candidates = await prisma.gameTextTranslationJob.findMany({
      where: {
        OR: [
          { status: 'pending', runAfter: { lte: now } },
          { status: 'running', leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });

    for (const candidate of candidates) {
      const claimed = await this.tryClaimCandidate(candidate);
      if (claimed) return claimed;
    }
    return null;
  }

  /** Test/helper: claim one job by id with the same lease + fencing rules. */
  static async claimJobById(jobId: string): Promise<ClaimedGameTextJob | null> {
    const candidate = await prisma.gameTextTranslationJob.findUnique({
      where: { id: jobId },
    });
    if (!candidate) return null;
    return this.tryClaimCandidate(candidate);
  }

  private static async tryClaimCandidate(
    candidate: GameTextTranslationJob,
  ): Promise<ClaimedGameTextJob | null> {
    const now = new Date();
    const due =
      (candidate.status === 'pending' && candidate.runAfter <= now) ||
      (candidate.status === 'running' &&
        candidate.leaseExpiresAt != null &&
        candidate.leaseExpiresAt < now);
    if (!due) return null;

    const leaseExpiresAt = new Date(
      now.getTime() + config.gameTextTranslationQueue.leaseMs,
    );
    const updated = await prisma.gameTextTranslationJob.updateMany({
      where: {
        id: candidate.id,
        claimToken: candidate.claimToken,
        OR: [
          { status: 'pending', runAfter: { lte: now } },
          { status: 'running', leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'running',
        leaseOwner: workerId,
        leaseExpiresAt,
        claimToken: { increment: 1 },
        lastError: null,
        errorCategory: null,
      },
    });
    if (updated.count !== 1) return null;

    const job = await prisma.gameTextTranslationJob.findUnique({
      where: { id: candidate.id },
    });
    if (!job || job.leaseOwner !== workerId || job.status !== 'running') {
      return null;
    }
    return {
      id: job.id,
      claimToken: job.claimToken,
      leaseOwner: workerId,
      job,
    };
  }

  static async runClaimedJob(claimed: ClaimedGameTextJob): Promise<void> {
    const { job, claimToken, leaseOwner } = claimed;
    try {
      if (!isGameTextLocalizationGenerationEnabled()) {
        await this.releaseToPending(job.id, claimToken, leaseOwner, {
          attempts: job.attempts,
          lastError: 'generation_disabled',
          errorCategory: 'configuration',
          runAfter: new Date(Date.now() + 60_000),
        });
        return;
      }

      const stillCurrent = await this.preflightSourceRevisions(job);
      if (!stillCurrent) {
        await prisma.gameTextTranslationJob.updateMany({
          where: { id: job.id, claimToken, leaseOwner, status: 'running' },
          data: {
            status: 'superseded',
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return;
      }

      const game = await prisma.game.findUnique({
        where: { id: job.gameId },
        select: {
          id: true,
          name: true,
          description: true,
          entityType: true,
          sport: true,
          club: { select: { name: true } },
        },
      });
      if (!game) {
        await prisma.gameTextTranslationJob.updateMany({
          where: { id: job.id, claimToken, leaseOwner, status: 'running' },
          data: {
            status: 'failed',
            attempts: job.attempts + 1,
            errorCategory: 'unknown',
            lastError: 'game_not_found',
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        return;
      }

      const meta = await prisma.gameTextSourceMeta.findUnique({
        where: { gameId: job.gameId },
      });

      const fields: Partial<Record<GameTextFieldKey, string>> = {};
      if (job.includeName && game.name?.trim()) {
        fields.name = game.name.trim();
      }
      if (job.includeDescription && game.description?.trim()) {
        fields.description = game.description.trim();
      }
      if (Object.keys(fields).length === 0) {
        await prisma.gameTextTranslationJob.updateMany({
          where: { id: job.id, claimToken, leaseOwner, status: 'running' },
          data: {
            status: 'done',
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            errorCategory: null,
          },
        });
        return;
      }

      const translated = await translateGameText({
        targetLocale: job.targetLocale,
        policyVersion: job.policyVersion,
        fields,
        entityType: game.entityType,
        sport: game.sport,
        clubName: game.club?.name ?? null,
        nameSourceLocaleOverride: meta?.nameSourceLocaleOverride ?? null,
        descriptionSourceLocaleOverride:
          meta?.descriptionSourceLocaleOverride ?? null,
      });

      const publish = await publishGameTextTranslationResult({
        jobId: job.id,
        claimToken,
        leaseOwner,
        expectedNameSourceRevision: job.nameSourceRevision,
        expectedDescriptionSourceRevision: job.descriptionSourceRevision,
        fields: translated,
      });

      if (publish.status === 'discarded') {
        console.info('[game-text-translation] publish_discarded', {
          jobId: job.id,
          reason: publish.reason,
          claimToken: claimToken.toString(),
        });
      } else {
        void publishGameTextInvalidation({
          gameId: job.gameId,
          locale: job.targetLocale,
          nameSourceRevision: job.nameSourceRevision,
          descriptionSourceRevision: job.descriptionSourceRevision,
          reason: 'published',
        });
      }
    } catch (err: unknown) {
      await this.handleJobFailure(job, claimToken, leaseOwner, err);
    }
  }

  private static async preflightSourceRevisions(
    job: GameTextTranslationJob,
  ): Promise<boolean> {
    const meta = await prisma.gameTextSourceMeta.findUnique({
      where: { gameId: job.gameId },
      select: {
        nameSourceRevision: true,
        descriptionSourceRevision: true,
      },
    });
    if (!meta) return false;
    return (
      meta.nameSourceRevision === job.nameSourceRevision &&
      meta.descriptionSourceRevision === job.descriptionSourceRevision
    );
  }

  private static async handleJobFailure(
    job: GameTextTranslationJob,
    claimToken: bigint,
    leaseOwner: string,
    err: unknown,
  ): Promise<void> {
    const attempts = job.attempts + 1;
    const category =
      err instanceof GameTextTranslationError
        ? err.category
        : categorizeUnknownError(err);
    const msg = errorMessage(err);
    const maxAttempts = config.gameTextTranslationQueue.maxAttempts;

    const stillOwned = await prisma.gameTextTranslationJob.findFirst({
      where: { id: job.id, claimToken, leaseOwner, status: 'running' },
      select: { id: true },
    });
    if (!stillOwned) {
      // Late failure after reclaim — do not mutate the new owner's job.
      return;
    }

    if (attempts >= maxAttempts) {
      await prisma.gameTextTranslationJob.updateMany({
        where: { id: job.id, claimToken, leaseOwner, status: 'running' },
        data: {
          status: 'failed',
          attempts,
          lastError: msg,
          errorCategory: category,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return;
    }

    await this.releaseToPending(job.id, claimToken, leaseOwner, {
      attempts,
      lastError: msg,
      errorCategory: category,
      runAfter: new Date(Date.now() + backoffMs(attempts)),
    });
  }

  private static async releaseToPending(
    jobId: string,
    claimToken: bigint,
    leaseOwner: string,
    data: {
      attempts: number;
      lastError: string;
      errorCategory: 'transient' | 'validation' | 'configuration' | 'provider' | 'unknown';
      runAfter: Date;
    },
  ): Promise<void> {
    await prisma.gameTextTranslationJob.updateMany({
      where: { id: jobId, claimToken, leaseOwner, status: 'running' },
      data: {
        status: 'pending',
        attempts: data.attempts,
        lastError: data.lastError,
        errorCategory: data.errorCategory,
        runAfter: data.runAfter,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }
}
