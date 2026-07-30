import {
  ParticipantRole,
  ParticipantStatus,
  PlayIntentJobStatus,
  PlayIntentMatchJobKind,
  Prisma,
  type PlayIntentMatchJob,
} from '@prisma/client';
import prisma from '../../config/database';
import { reportPlayIntentQueueError } from './playIntentQueueFailure';
import { PlayIntentDrainCoordinator } from './playIntentDrainCoordinator';

const POLL_INTERVAL_MS = 5_000;
const STALE_RUNNING_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 12;
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000;
const FAILED_REPLAY_WINDOW_MS = 6 * 60 * 60 * 1000;

let workerTimer: ReturnType<typeof setInterval> | null = null;
const drainCoordinator = new PlayIntentDrainCoordinator();

type MatchJobDb = Pick<Prisma.TransactionClient, 'playIntentMatchJob'>;

export class PlayIntentMatchQueueService {
  static async enqueueIntentCreated(
    db: MatchJobDb,
    intentId: string,
  ): Promise<void> {
    await db.playIntentMatchJob.create({
      data: {
        kind: PlayIntentMatchJobKind.INTENT_CREATED,
        sourceId: intentId,
      },
    });
  }

  static async enqueuePublicGameCreated(
    db: MatchJobDb,
    gameId: string,
    creatorId: string,
  ): Promise<void> {
    await db.playIntentMatchJob.create({
      data: {
        kind: PlayIntentMatchJobKind.PUBLIC_GAME_CREATED,
        sourceId: gameId,
        creatorId,
      },
    });
  }

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
    await prisma.playIntentMatchJob.updateMany({
      where: {
        status: PlayIntentJobStatus.running,
        updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
      },
      data: {
        status: PlayIntentJobStatus.pending,
        runAfter: new Date(),
      },
    });
  }

  private static async claimNext(): Promise<PlayIntentMatchJob | null> {
    const candidate = await prisma.playIntentMatchJob.findFirst({
      where: {
        status: PlayIntentJobStatus.pending,
        runAfter: { lte: new Date() },
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) return null;

    const claimed = await prisma.playIntentMatchJob.updateMany({
      where: {
        id: candidate.id,
        status: PlayIntentJobStatus.pending,
      },
      data: {
        status: PlayIntentJobStatus.running,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return null;
    return prisma.playIntentMatchJob.findUnique({
      where: { id: candidate.id },
    });
  }

  static async requeueFailedJobs(): Promise<number> {
    const result = await prisma.playIntentMatchJob.updateMany({
      where: {
        status: PlayIntentJobStatus.failed,
        updatedAt: { gt: new Date(Date.now() - FAILED_REPLAY_WINDOW_MS) },
      },
      data: {
        status: PlayIntentJobStatus.pending,
        attempts: 0,
        runAfter: new Date(),
        lastError: 'scheduler_replay',
      },
    });
    return result.count;
  }

  private static async process(job: PlayIntentMatchJob): Promise<void> {
    try {
      const { PlayIntentMatchService } = await import('./playIntentMatch.service');
      if (job.kind === PlayIntentMatchJobKind.INTENT_CREATED) {
        await PlayIntentMatchService.onIntentCreated(job.sourceId);
      } else {
        const owner = await prisma.gameParticipant.findFirst({
          where: {
            gameId: job.sourceId,
            role: ParticipantRole.OWNER,
            status: ParticipantStatus.PLAYING,
          },
          select: { userId: true },
        });
        await PlayIntentMatchService.onPublicGameCreated(
          job.sourceId,
          owner?.userId ?? job.creatorId ?? '',
        );
      }
      await prisma.playIntentMatchJob.update({
        where: { id: job.id },
        data: {
          status: PlayIntentJobStatus.done,
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
      await prisma.playIntentMatchJob.update({
        where: { id: job.id },
        data: {
          status: failed
            ? PlayIntentJobStatus.failed
            : PlayIntentJobStatus.pending,
          runAfter: new Date(Date.now() + retryDelay),
          lastError: message.slice(0, 2_000),
        },
      });
      if (failed) {
        reportPlayIntentQueueError(
          `play-intent-match:${job.kind.toLowerCase()}`,
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
          'play-intent-match',
          'drain failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }
}
