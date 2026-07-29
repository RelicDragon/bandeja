import prisma from '../config/database';
import { TranslationQueueService } from '../services/chat/translationQueue.service';
import { GameResultsArtifactQueueService } from '../services/gameResultsArtifact/gameResultsArtifactQueue.service';
import { PlayIntentFollowerNotificationQueueService } from '../services/playIntent/playIntentFollowerNotificationQueue.service';
import { PlayIntentMatchQueueService } from '../services/playIntent/playIntentMatchQueue.service';
import { PlayIntentNotificationDeliveryQueueService } from '../services/playIntent/playIntentNotificationDeliveryQueue.service';
import { PlayIntentQueueMaintenanceService } from '../services/playIntent/playIntentQueueMaintenance.service';

export async function connectWorkersDatabase(): Promise<void> {
  await prisma.$connect();
}

export function startQueueWorkers(): void {
  TranslationQueueService.startWorker();
  GameResultsArtifactQueueService.startWorker();
  PlayIntentFollowerNotificationQueueService.startWorker();
  PlayIntentMatchQueueService.startWorker();
  PlayIntentNotificationDeliveryQueueService.startWorker();
  PlayIntentQueueMaintenanceService.start();
}

export function stopQueueWorkers(): void {
  TranslationQueueService.stopWorker();
  GameResultsArtifactQueueService.stopWorker();
  PlayIntentFollowerNotificationQueueService.stopWorker();
  PlayIntentMatchQueueService.stopWorker();
  PlayIntentNotificationDeliveryQueueService.stopWorker();
  PlayIntentQueueMaintenanceService.stop();
}

export async function disconnectWorkersDatabase(): Promise<void> {
  await prisma.$disconnect();
}
