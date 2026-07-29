import prisma from '../config/database';
import { TranslationQueueService } from '../services/chat/translationQueue.service';
import { GameResultsArtifactQueueService } from '../services/gameResultsArtifact/gameResultsArtifactQueue.service';
import { PlayIntentFollowerNotificationQueueService } from '../services/playIntent/playIntentFollowerNotificationQueue.service';

export async function connectWorkersDatabase(): Promise<void> {
  await prisma.$connect();
}

export function startQueueWorkers(): void {
  TranslationQueueService.startWorker();
  GameResultsArtifactQueueService.startWorker();
  PlayIntentFollowerNotificationQueueService.startWorker();
}

export function stopQueueWorkers(): void {
  TranslationQueueService.stopWorker();
  GameResultsArtifactQueueService.stopWorker();
  PlayIntentFollowerNotificationQueueService.stopWorker();
}

export async function disconnectWorkersDatabase(): Promise<void> {
  await prisma.$disconnect();
}
