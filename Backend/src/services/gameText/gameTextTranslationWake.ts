import { GameTextTranslationQueueService } from './gameTextTranslationQueue.service';

/**
 * Optional post-commit wakeup for the game-text translation worker.
 * Redis publish is best-effort; DB polling recovers missed wakes.
 */
export function wakeGameTextTranslationWorker(): void {
  GameTextTranslationQueueService.wake();
}
