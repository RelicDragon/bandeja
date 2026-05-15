import { TranslationQueueService } from '../chat/translationQueue.service';

export class AdminTranslationQueueStatsService {
  static getStats() {
    return TranslationQueueService.getStats();
  }
}
