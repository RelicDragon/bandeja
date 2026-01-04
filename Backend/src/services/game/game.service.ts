export { GameReadinessService } from './readiness.service';
export { GameCreateService } from './create.service';
export { GameReadService } from './read.service';
export { GameUpdateService } from './update.service';
export { GameDeleteService } from './delete.service';
export { ParticipantService } from './participant.service';
export { JoinQueueService } from './joinQueue.service';
export { AdminService } from './admin.service';
export { OwnershipService } from './ownership.service';

import { GameReadinessService } from './readiness.service';
import { GameCreateService } from './create.service';
import { GameReadService } from './read.service';
import { GameUpdateService } from './update.service';
import { GameDeleteService } from './delete.service';

export class GameService {
  static async calculateGameReadiness(gameId: string) {
    return GameReadinessService.calculateGameReadiness(gameId);
  }

  static async updateGameReadiness(gameId: string) {
    return GameReadinessService.updateGameReadiness(gameId);
  }

  static async createGame(data: any, userId: string) {
    return GameCreateService.createGame(data, userId);
  }

  static async getGameById(id: string, userId?: string) {
    return GameReadService.getGameById(id, userId);
  }

  static async getGames(filters: any, userId?: string, userCityId?: string) {
    return GameReadService.getGames(filters, userId, userCityId);
  }

  static async getMyGames(userId: string, userCityId?: string) {
    return GameReadService.getMyGames(userId, userCityId);
  }

  static async getPastGames(userId: string, userCityId?: string, limit: number = 10, offset: number = 0) {
    return GameReadService.getPastGames(userId, userCityId, limit, offset);
  }

  static async getAvailableGames(userId: string, userCityId?: string, startDate?: string, endDate?: string, showArchived?: boolean) {
    return GameReadService.getAvailableGames(userId, userCityId, startDate, endDate, showArchived);
  }

  static async updateGame(id: string, data: any, userId: string, isAdmin: boolean) {
    return GameUpdateService.updateGame(id, data, userId, isAdmin);
  }

  static async deleteGame(id: string) {
    return GameDeleteService.deleteGame(id);
  }
}

