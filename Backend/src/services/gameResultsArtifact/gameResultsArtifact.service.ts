import prisma from '../../config/database';
import { GameResultsArtifactStepStatus } from '@prisma/client';
import { config } from '../../config/env';
import { GamePhotoCreateService } from '../gamePhoto/gamePhoto.create.service';
import { emitGamePhotoAdded, emitGamePhotoMainChanged } from '../gamePhoto/gamePhoto.events';
import {
  ReplicateImageService,
  type ReplicatePredictionRecord,
} from '../replicate/replicateImage.service';
import { emitGameUpdateAfterArtifactsChange } from './gameResultsArtifact.events';
import { logResultsArtifact } from './gameResultsArtifact.log';
import { isResultsArtifactsReady } from './gameResultsArtifact.readiness';
import { loadGameForResultsSummary } from './gameResultsArtifact.loadGame';
import { GameResultsArtifactQueueService } from './gameResultsArtifactQueue.service';
import { MAX_ARTIFACT_PHOTO_GENERATIONS } from './gameResultsArtifact.photoLimit';
import {
  failArtifactPhotoApplyClaim,
  revertArtifactPhotoApplyClaim,
  tryClaimArtifactPhotoApply,
} from './gameResultsArtifact.photoApplyClaim';
import { isPrismaDeadlockError } from '../../utils/prismaDeadlock';
import { PhotoProvider } from './providers/photo.provider';
import { SummaryProvider } from './providers/summary.provider';

export type GameResultsArtifactTestDeps = {
  summaryGenerate?: (game: unknown, language: string) => Promise<string>;
  onStepEnter?: (step: 'summary' | 'photo') => void;
};

let artifactTestDeps: GameResultsArtifactTestDeps | null = null;

export function setGameResultsArtifactTestDeps(
  deps: GameResultsArtifactTestDeps | null
): void {
  artifactTestDeps = deps;
}

function terminalSummary(status: GameResultsArtifactStepStatus): boolean {
  return status === 'done' || status === 'skipped';
}

function terminalPhoto(status: GameResultsArtifactStepStatus): boolean {
  return status === 'done' || status === 'skipped';
}

export class GameResultsArtifactService {
  static async runSummaryStep(jobId: string): Promise<void> {
    const job = await prisma.gameResultsArtifactJob.findUnique({ where: { id: jobId } });
    if (!job || terminalSummary(job.summaryStatus)) return;

    artifactTestDeps?.onStepEnter?.('summary');

    const startedAt = Date.now();
    await prisma.gameResultsArtifactJob.update({
      where: { id: jobId },
      data: { summaryStatus: 'running', summaryError: null },
    });

    const game = await loadGameForResultsSummary(job.gameId);
    if (!game) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: {
          summaryStatus: 'failed',
          summaryError: 'Game not found',
        },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'summary',
        provider: 'llm',
        durationMs: Date.now() - startedAt,
        status: 'failed',
        error: 'Game not found',
      });
      return;
    }

    try {
      let summary: string;
      let provider = 'llm';
      if (artifactTestDeps?.summaryGenerate) {
        summary = await artifactTestDeps.summaryGenerate(game, job.languageCode);
        provider = 'test';
      } else if (!SummaryProvider.isConfigured()) {
        await prisma.gameResultsArtifactJob.update({
          where: { id: jobId },
          data: { summaryStatus: 'skipped', summaryError: null },
        });
        logResultsArtifact({
          gameId: job.gameId,
          generationVersion: job.generationVersion,
          step: 'summary',
          provider: 'llm',
          durationMs: Date.now() - startedAt,
          status: 'skipped',
        });
        return;
      } else {
        summary = await SummaryProvider.generate(game, job.languageCode);
      }
      const now = new Date();
      await prisma.$transaction([
        prisma.game.update({
          where: { id: job.gameId },
          data: {
            resultsSummaryText: summary,
            resultsSummaryGeneratedAt: now,
          },
        }),
        prisma.gameResultsArtifactJob.update({
          where: { id: jobId },
          data: { summaryStatus: 'done', summaryError: null },
        }),
      ]);
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'summary',
        provider,
        durationMs: Date.now() - startedAt,
        status: 'done',
      });
      void emitGameUpdateAfterArtifactsChange(job.gameId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { summaryStatus: 'failed', summaryError: msg },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'summary',
        provider: 'llm',
        durationMs: Date.now() - startedAt,
        status: 'failed',
        error: msg,
      });
    }
  }

  static async runPhotoStep(jobId: string): Promise<void> {
    const job = await prisma.gameResultsArtifactJob.findUnique({ where: { id: jobId } });
    if (!job || terminalPhoto(job.photoStatus)) return;

    artifactTestDeps?.onStepEnter?.('photo');

    const startedAt = Date.now();

    if (job.hadUserPhotosAtEnqueue) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { photoStatus: 'skipped', photoError: null },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'photo',
        provider: 'replicate',
        durationMs: Date.now() - startedAt,
        status: 'skipped',
      });
      return;
    }

    if (!PhotoProvider.isConfigured()) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { photoStatus: 'skipped', photoError: null },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'photo',
        provider: 'replicate',
        durationMs: Date.now() - startedAt,
        status: 'skipped',
      });
      return;
    }

    if (job.photoGenerationsUsed >= MAX_ARTIFACT_PHOTO_GENERATIONS) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: {
          photoStatus: 'failed',
          photoError: `Photo generation limit reached (${MAX_ARTIFACT_PHOTO_GENERATIONS} per game)`,
        },
      });
      return;
    }

    try {
      if (job.replicatePredictionId) {
        const prediction = await PhotoProvider.getPrediction(job.replicatePredictionId);
        await this.applyPhotoPrediction(jobId, job.gameId, prediction);
        return;
      }

      const prediction = await PhotoProvider.startPrediction(
        job.gameId,
        job.generationVersion,
        job.replicatePhotoModel
      );
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: {
          replicatePredictionId: prediction.id,
          replicatePhotoModel: prediction.modelId,
          photoStatus: 'running',
          photoError: null,
        },
      });

      if (ReplicateImageService.isTerminalStatus(prediction.status)) {
        await this.applyPhotoPrediction(jobId, job.gameId, prediction);
        logResultsArtifact({
          gameId: job.gameId,
          generationVersion: job.generationVersion,
          step: 'photo',
          provider: 'replicate',
          durationMs: Date.now() - startedAt,
          status: 'done',
          replicatePredictionId: prediction.id,
        });
      } else {
        await GameResultsArtifactQueueService.deferJob(jobId);
        logResultsArtifact({
          gameId: job.gameId,
          generationVersion: job.generationVersion,
          step: 'photo',
          provider: 'replicate',
          durationMs: Date.now() - startedAt,
          status: 'deferred',
          replicatePredictionId: prediction.id,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { photoStatus: 'failed', photoError: msg },
      });
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'photo',
        provider: 'replicate',
        durationMs: Date.now() - startedAt,
        status: 'failed',
        error: msg,
      });
    }
  }

  static async handleReplicateWebhook(
    prediction: ReplicatePredictionRecord
  ): Promise<void> {
    const job = await prisma.gameResultsArtifactJob.findFirst({
      where: { replicatePredictionId: prediction.id },
    });
    if (!job || terminalPhoto(job.photoStatus)) return;

    if (ReplicateImageService.isRunningStatus(prediction.status)) return;

    await this.applyPhotoPrediction(job.id, job.gameId, prediction);
    await this.finalizeJob(job.id);
    void GameResultsArtifactQueueService.drain();
  }

  private static async applyPhotoPrediction(
    jobId: string,
    gameId: string,
    prediction: ReplicatePredictionRecord
  ): Promise<void> {
    if (ReplicateImageService.isRunningStatus(prediction.status)) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { photoStatus: 'running', photoError: null },
      });
      await GameResultsArtifactQueueService.deferJob(jobId);
      return;
    }

    if (prediction.status !== 'succeeded') {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: {
          photoStatus: 'failed',
          photoError: prediction.error || `Replicate status: ${prediction.status}`,
        },
      });
      return;
    }

    const job = await prisma.gameResultsArtifactJob.findUnique({ where: { id: jobId } });
    if (!job || terminalPhoto(job.photoStatus)) return;

    if (job.photoGenerationsUsed >= MAX_ARTIFACT_PHOTO_GENERATIONS) {
      await prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: {
          photoStatus: 'failed',
          photoError: `Photo generation limit reached (${MAX_ARTIFACT_PHOTO_GENERATIONS} per game)`,
        },
      });
      return;
    }

    const claimed = await tryClaimArtifactPhotoApply(jobId);
    if (!claimed) return;

    try {
      const buffer = await PhotoProvider.downloadOutputBuffer(
        prediction,
        job.replicatePhotoModel
      );
      const dto = await GamePhotoCreateService.createFromGeneratedBuffer(
        gameId,
        buffer,
        'ai-results.webp'
      );

      const actorUserId = await this.resolvePhotoActorUserId(gameId);
      await emitGamePhotoAdded(gameId, dto, actorUserId);
      await emitGamePhotoMainChanged(gameId, dto.id, actorUserId);
      void emitGameUpdateAfterArtifactsChange(gameId);
    } catch (err: unknown) {
      if (isPrismaDeadlockError(err)) {
        await revertArtifactPhotoApplyClaim(jobId);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        await failArtifactPhotoApplyClaim(jobId, msg);
      }
      throw err;
    }
  }

  private static async resolvePhotoActorUserId(gameId: string): Promise<string> {
    const participant = await prisma.gameParticipant.findFirst({
      where: { gameId, status: 'PLAYING' },
      select: { userId: true },
      orderBy: { joinedAt: 'asc' },
    });
    return participant?.userId ?? gameId;
  }

  static async finalizeJob(jobId: string): Promise<void> {
    const job = await prisma.gameResultsArtifactJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    if (!isResultsArtifactsReady(job)) {
      const failed =
        job.summaryStatus === 'failed' || job.photoStatus === 'failed';
      if (failed && job.status !== 'failed') {
        await prisma.gameResultsArtifactJob.update({
          where: { id: jobId },
          data: { status: 'failed' },
        });
      }
      return;
    }

    const game = await prisma.game.findUnique({
      where: { id: job.gameId },
      select: {
        resultsArtifactsVersion: true,
        resultsArtifactsReadyAt: true,
      },
    });
    if (!game || game.resultsArtifactsVersion !== job.generationVersion) {
      return;
    }

    const wasReady = game.resultsArtifactsReadyAt != null;
    const now = new Date();
    await prisma.$transaction([
      prisma.game.update({
        where: { id: job.gameId },
        data: { resultsArtifactsReadyAt: now },
      }),
      prisma.gameResultsArtifactJob.update({
        where: { id: jobId },
        data: { status: 'done', lastError: null },
      }),
    ]);

    if (!wasReady) {
      logResultsArtifact({
        gameId: job.gameId,
        generationVersion: job.generationVersion,
        step: 'finalize',
        status: 'ready',
      });
      void emitGameUpdateAfterArtifactsChange(job.gameId);
    }
  }

  static async runJob(jobId: string): Promise<void> {
    if (!config.resultsArtifacts.enabled) return;

    const job = await prisma.gameResultsArtifactJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'running') return;

    await Promise.all([
      this.runSummaryStep(jobId),
      this.runPhotoStep(jobId),
    ]);

    const refreshed = await prisma.gameResultsArtifactJob.findUnique({
      where: { id: jobId },
    });
    if (
      refreshed &&
      (refreshed.summaryStatus === 'running' || refreshed.photoStatus === 'running')
    ) {
      await GameResultsArtifactQueueService.deferJob(jobId);
      return;
    }

    await this.finalizeJob(jobId);
  }
}
