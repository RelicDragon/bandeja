import prisma from '../config/database';
import { AgentRunQueueService } from '../services/agent/agentRunQueue.service';
import { TranslationQueueService } from '../services/chat/translationQueue.service';
import { GameTextTranslationQueueService } from '../services/gameText/gameTextTranslationQueue.service';
import { FaqTranslationQueueService } from '../services/faq/faqTranslationQueue.service';
import { GameResultsArtifactQueueService } from '../services/gameResultsArtifact/gameResultsArtifactQueue.service';
import { PlayIntentFollowerNotificationQueueService } from '../services/playIntent/playIntentFollowerNotificationQueue.service';
import { PlayIntentMatchQueueService } from '../services/playIntent/playIntentMatchQueue.service';
import { PlayIntentNotificationDeliveryQueueService } from '../services/playIntent/playIntentNotificationDeliveryQueue.service';
import { PlayIntentQueueMaintenanceService } from '../services/playIntent/playIntentQueueMaintenance.service';

export async function connectWorkersDatabase(): Promise<void> {
  await prisma.$connect();
}

/** `role`: `server.ts` is `api` (default), `worker.ts` is `worker` (agent runs need Redis there). */
export function startQueueWorkers(options: { role: 'api' | 'worker' } = { role: 'api' }): void {
  TranslationQueueService.startWorker();
  GameTextTranslationQueueService.startWorker();
  FaqTranslationQueueService.startWorker();
  GameResultsArtifactQueueService.startWorker();
  PlayIntentFollowerNotificationQueueService.startWorker();
  PlayIntentMatchQueueService.startWorker();
  PlayIntentNotificationDeliveryQueueService.startWorker();
  PlayIntentQueueMaintenanceService.start();
  AgentRunQueueService.startWorker({ role: options.role });
}

export function stopQueueWorkers(): void {
  TranslationQueueService.stopWorker();
  GameTextTranslationQueueService.stopWorker();
  FaqTranslationQueueService.stopWorker();
  GameResultsArtifactQueueService.stopWorker();
  PlayIntentFollowerNotificationQueueService.stopWorker();
  PlayIntentMatchQueueService.stopWorker();
  PlayIntentNotificationDeliveryQueueService.stopWorker();
  PlayIntentQueueMaintenanceService.stop();
  AgentRunQueueService.stopWorker();
}

export async function disconnectWorkersDatabase(): Promise<void> {
  await prisma.$disconnect();
}
