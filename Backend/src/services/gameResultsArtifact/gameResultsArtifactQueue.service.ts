import {
  GamePhotoSource,
  GameResultsArtifactStepStatus,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { isRedisConfigured } from '../redis/redisClient';
import { TranslationService } from '../chat/translation.service';
import { GameResultsArtifactRedis } from './gameResultsArtifactRedis.service';
import { shouldSkipArtifactReenqueue } from './gameResultsArtifact.enqueuePolicy';
import { ReplicatePhotoModelSettingService } from '../replicate/replicatePhotoModelSetting.service';
import { logResultsArtifact } from './gameResultsArtifact.log';
import { GameResultsArtifactService } from './gameResultsArtifact.service';

export type GameResultsArtifactStep = 'summary' | 'photo';

export type EnqueueArtifactStepOptions = {
  /** User-triggered photo regen: bypass auto-skip when game had user photos. */
  manualPhoto?: boolean;
};

function stepTerminal(status: GameResultsArtifactStepStatus): boolean {
  return status === 'done' || status === 'skipped' || status === 'failed';
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let sweeperTimer: ReturnType<typeof setInterval> | null = null;
let activeWorkers = 0;

export type GameResultsArtifactQueueStats = {
  enabled: boolean;
  pending: number;
  running: number;
  done: number;
  failed: number;
  staleRunningReset: number;
  recentFailed: Array<{
    gameId: string;
    lastError: string | null;
    summaryStatus: string;
    photoStatus: string;
    updatedAt: Date;
  }>;
  worker: { active: number; maxConcurrency: number };
  redis: { configured: boolean };
};

export class GameResultsArtifactQueueService {
  static getActiveWorkerCount(): number {
    return activeWorkers;
  }

  static async getStats(): Promise<GameResultsArtifactQueueStats> {
    const staleRunningReset = await this.sweepStaleRunningJobs();
    const [pending, running, done, failed, recentFailed] = await Promise.all([
      prisma.gameResultsArtifactJob.count({ where: { status: 'pending' } }),
      prisma.gameResultsArtifactJob.count({ where: { status: 'running' } }),
      prisma.gameResultsArtifactJob.count({ where: { status: 'done' } }),
      prisma.gameResultsArtifactJob.count({ where: { status: 'failed' } }),
      prisma.gameResultsArtifactJob.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: {
          gameId: true,
          lastError: true,
          summaryStatus: true,
          photoStatus: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      enabled: config.resultsArtifacts.enabled,
      pending,
      running,
      done,
      failed,
      staleRunningReset,
      recentFailed,
      worker: {
        active: activeWorkers,
        maxConcurrency: config.resultsArtifacts.queue.concurrency,
      },
      redis: { configured: isRedisConfigured() },
    };
  }

  static async sweepStaleRunningJobs(): Promise<number> {
    const staleBefore = new Date(
      Date.now() - config.resultsArtifacts.queue.staleRunningMs
    );
    const result = await prisma.gameResultsArtifactJob.updateMany({
      where: { status: 'running', updatedAt: { lt: staleBefore } },
      data: { status: 'pending' },
    });
    if (result.count > 0) {
      logResultsArtifact({
        gameId: '*',
        step: 'sweep_stale_running',
        status: `reset_${result.count}`,
      });
    }
    return result.count;
  }
  static async enqueueStep(
    gameId: string,
    step: GameResultsArtifactStep,
    options: EnqueueArtifactStepOptions = {}
  ): Promise<void> {
    if (!config.resultsArtifacts.enabled) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        status: true,
        resultsSentToTelegram: true,
        resultsSummaryText: true,
        photosCount: true,
        mainPhotoId: true,
        resultsArtifactJob: true,
        city: { select: { telegramPinnedLanguage: true } },
      },
    });
    if (
      !game ||
      shouldSkipArtifactReenqueue({ resultsSentToTelegram: game.resultsSentToTelegram })
    ) {
      return;
    }

    const languageCode = TranslationService.extractLanguageCode(
      game.city.telegramPinnedLanguage || 'en-GB'
    );
    const hadUserPhotos =
      (await prisma.gamePhoto.count({
        where: { gameId, deletedAt: null, source: GamePhotoSource.USER },
      })) > 0;
    const hasSummary = Boolean(game.resultsSummaryText?.trim());
    const job = game.resultsArtifactJob;

    if (
      step === 'photo' &&
      !options.manualPhoto &&
      hadUserPhotos &&
      game.status !== 'ARCHIVED'
    ) {
      return;
    }

    if (
      step === 'summary' &&
      job &&
      (job.summaryStatus === 'pending' || job.summaryStatus === 'running')
    ) {
      return;
    }
    if (
      step === 'photo' &&
      job &&
      (job.photoStatus === 'pending' || job.photoStatus === 'running')
    ) {
      return;
    }

    let summaryStatus: GameResultsArtifactStepStatus;
    let photoStatus: GameResultsArtifactStepStatus;
    let replicatePredictionId: string | null = job?.replicatePredictionId ?? null;

    if (step === 'summary') {
      summaryStatus = 'pending';
      if (job) {
        photoStatus = stepTerminal(job.photoStatus)
          ? job.photoStatus
          : hadUserPhotos
            ? 'skipped'
            : job.photoStatus;
      } else {
        photoStatus = hadUserPhotos ? 'skipped' : 'skipped';
      }
      replicatePredictionId = job?.replicatePredictionId ?? null;
    } else {
      photoStatus = 'pending';
      replicatePredictionId = null;
      if (job) {
        summaryStatus = stepTerminal(job.summaryStatus)
          ? job.summaryStatus
          : hasSummary
            ? 'done'
            : job.summaryStatus;
      } else {
        summaryStatus = hasSummary ? 'done' : 'skipped';
      }
    }

    const gameData: Prisma.GameUpdateInput = {
      resultsArtifactsReadyAt: null,
      resultsArtifactsVersion: { increment: 1 },
    };
    if (step === 'summary') {
      gameData.resultsSummaryText = null;
      gameData.resultsSummaryGeneratedAt = null;
    }

    const replicatePhotoModel =
      step === 'photo' ? await ReplicatePhotoModelSettingService.getActiveModelId() : undefined;

    const enqueued = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE
      `;

      const lockedJob = await tx.gameResultsArtifactJob.findUnique({
        where: { gameId },
      });
      if (
        step === 'summary' &&
        lockedJob &&
        (lockedJob.summaryStatus === 'pending' || lockedJob.summaryStatus === 'running')
      ) {
        return false;
      }
      if (
        step === 'photo' &&
        lockedJob &&
        (lockedJob.photoStatus === 'pending' || lockedJob.photoStatus === 'running')
      ) {
        return false;
      }

      await tx.gameResultsArtifactJob.upsert({
        where: { gameId },
        create: {
          gameId,
          languageCode,
          userPhotoCountAtEnqueue: game.photosCount,
          mainPhotoIdAtEnqueue: game.mainPhotoId,
          hadUserPhotosAtEnqueue: options.manualPhoto ? false : hadUserPhotos,
          status: 'pending',
          runAfter: new Date(),
          summaryStatus,
          photoStatus,
          replicatePredictionId,
          ...(replicatePhotoModel ? { replicatePhotoModel } : {}),
        },
        update: {
          languageCode,
          userPhotoCountAtEnqueue: game.photosCount,
          mainPhotoIdAtEnqueue: game.mainPhotoId,
          hadUserPhotosAtEnqueue: options.manualPhoto ? false : hadUserPhotos,
          status: 'pending',
          runAfter: new Date(),
          attempts: 0,
          lastError: null,
          summaryStatus,
          ...(step === 'summary' ? { summaryError: null } : {}),
          photoStatus,
          ...(step === 'photo' ? { photoError: null } : {}),
          replicatePredictionId,
          ...(replicatePhotoModel ? { replicatePhotoModel } : {}),
          generationVersion: { increment: 1 },
        },
      });
      await tx.game.update({
        where: { id: gameId },
        data: gameData,
      });
      return true;
    });

    if (!enqueued) return;

    logResultsArtifact({
      gameId,
      step: `enqueue_${step}`,
      status: 'pending',
    });

    void GameResultsArtifactRedis.publishWake();
    void this.drain();
  }

  static startWorker(): void {
    if (!config.resultsArtifacts.enabled || workerTimer) return;
    const intervalMs = config.resultsArtifacts.queue.pollIntervalMs;
    workerTimer = setInterval(() => {
      void this.drain();
    }, intervalMs);
    const sweepMs = Math.max(
      60_000,
      Math.floor(config.resultsArtifacts.queue.staleRunningMs / 2)
    );
    sweeperTimer = setInterval(() => {
      void this.sweepStaleRunningJobs();
    }, sweepMs);
    void GameResultsArtifactRedis.startWakeListener(() => {
      void this.drain();
    });
    void this.drain();
  }

  static stopWorker(): void {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
    if (sweeperTimer) {
      clearInterval(sweeperTimer);
      sweeperTimer = null;
    }
  }

  static async deferJob(
    jobId: string,
    delayMs = config.resultsArtifacts.replicatePollDelayMs
  ): Promise<void> {
    await prisma.gameResultsArtifactJob.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        runAfter: new Date(Date.now() + delayMs),
      },
    });
    void GameResultsArtifactRedis.publishWake();
  }

  static async drain(): Promise<void> {
    if (!config.resultsArtifacts.enabled) return;
    const maxConcurrency = config.resultsArtifacts.queue.concurrency;
    while (activeWorkers < maxConcurrency) {
      const job = await this.claimNextJob();
      if (!job) break;
      activeWorkers += 1;
      void this.runQueuedJob(job.id).finally(() => {
        activeWorkers -= 1;
      });
      if (config.resultsArtifacts.queue.minIntervalMs > 0) {
        await new Promise((r) =>
          setTimeout(r, config.resultsArtifacts.queue.minIntervalMs)
        );
      }
    }
  }

  private static async claimNextJob(): Promise<{ id: string } | null> {
    await this.sweepStaleRunningJobs();

    const pick = await prisma.gameResultsArtifactJob.findFirst({
      where: {
        status: 'pending',
        runAfter: { lte: new Date() },
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
    });
    if (!pick) return null;

    const updated = await prisma.gameResultsArtifactJob.updateMany({
      where: { id: pick.id, status: 'pending' },
      data: { status: 'running', updatedAt: new Date() },
    });
    if (updated.count !== 1) return null;

    const lockTtlSec = Math.max(
      60,
      Math.ceil(config.resultsArtifacts.queue.staleRunningMs / 1000)
    );
    const locked = await GameResultsArtifactRedis.tryAcquireClaimLock(
      pick.id,
      lockTtlSec
    );
    if (!locked) {
      await prisma.gameResultsArtifactJob.updateMany({
        where: { id: pick.id, status: 'running' },
        data: { status: 'pending' },
      });
      return null;
    }

    return { id: pick.id };
  }

  private static async runQueuedJob(jobId: string): Promise<void> {
    const job = await prisma.gameResultsArtifactJob.findUnique({
      where: { id: jobId },
    });
    if (!job || job.status !== 'running') {
      await GameResultsArtifactRedis.releaseClaimLock(jobId);
      return;
    }

    const startedAt = Date.now();
    logResultsArtifact({
      gameId: job.gameId,
      generationVersion: job.generationVersion,
      step: 'job_start',
      status: 'running',
    });

    try {
      await GameResultsArtifactService.runJob(jobId);
      const finished = await prisma.gameResultsArtifactJob.findUnique({
        where: { id: jobId },
        select: { status: true, summaryStatus: true, photoStatus: true },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'job_finish',
        durationMs: Date.now() - startedAt,
        status: finished?.status ?? 'unknown',
      });
    } catch (err: unknown) {
      const attempts = job.attempts + 1;
      const msg = err instanceof Error ? err.message : String(err);
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'job_error',
        durationMs: Date.now() - startedAt,
        error: msg,
        status: 'retry',
      });
      const maxAttempts = config.resultsArtifacts.queue.maxAttempts;
      if (attempts >= maxAttempts) {
        await prisma.gameResultsArtifactJob.update({
          where: { id: jobId },
          data: { status: 'failed', attempts, lastError: msg },
        });
      } else {
        const delay = Math.min(60_000, 1000 * 2 ** attempts);
        await prisma.gameResultsArtifactJob.update({
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
      await GameResultsArtifactRedis.releaseClaimLock(jobId);
    }
  }
}
