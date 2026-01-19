import { ParticipantService } from './participant.service';

// TODO: Remove after 2025-02-02 - This entire service is deprecated
// Use ParticipantService methods instead:
// - addToQueueAsParticipant() instead of addToQueue()
// - acceptNonPlayingParticipant() instead of acceptJoinQueue()
// - declineNonPlayingParticipant() instead of declineJoinQueue()
// - cancelNonPlayingParticipant() instead of cancelJoinQueue()

export class JoinQueueService {
  // TODO: Remove after 2025-02-02 - Use ParticipantService.addToQueueAsParticipant()
  static async addToQueue(gameId: string, userId: string) {
    // Delegate to new service for backward compatibility
    return await ParticipantService.addToQueueAsParticipant(gameId, userId);
  }

  // TODO: Remove after 2025-02-02 - Use ParticipantService.acceptNonPlayingParticipant()
  static async acceptJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    return await ParticipantService.acceptNonPlayingParticipant(gameId, currentUserId, queueUserId);
  }

  // TODO: Remove after 2025-02-02 - Use ParticipantService.declineNonPlayingParticipant()
  static async declineJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    return await ParticipantService.declineNonPlayingParticipant(gameId, currentUserId, queueUserId);
  }

  // TODO: Remove after 2025-02-02 - Use ParticipantService.cancelNonPlayingParticipant()
  static async cancelJoinQueue(gameId: string, userId: string) {
    return await ParticipantService.cancelNonPlayingParticipant(gameId, userId);
  }
}

