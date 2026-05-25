import { GameResultsArtifactQueueService } from '../gameResultsArtifact/gameResultsArtifactQueue.service';

export class AdminGameResultsArtifactQueueStatsService {
  static getStats() {
    return GameResultsArtifactQueueService.getStats();
  }
}
