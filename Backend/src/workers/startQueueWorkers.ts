import prisma from '../config/database';
import { TranslationQueueService } from '../services/chat/translationQueue.service';
import { GameResultsArtifactQueueService } from '../services/gameResultsArtifact/gameResultsArtifactQueue.service';

export async function connectWorkersDatabase(): Promise<void> {
  await prisma.$connect();
}

export function startQueueWorkers(): void {
  TranslationQueueService.startWorker();
  GameResultsArtifactQueueService.startWorker();
}

export function stopQueueWorkers(): void {
  TranslationQueueService.stopWorker();
  GameResultsArtifactQueueService.stopWorker();
}

export async function disconnectWorkersDatabase(): Promise<void> {
  await prisma.$disconnect();
}
