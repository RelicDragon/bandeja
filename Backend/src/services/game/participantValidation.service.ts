import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ParticipantRole, GameParticipant } from '@prisma/client';

export class ParticipantValidationService {
  static async validateCanModifyParticipants(
    gameId: string,
    userId: string,
    allowedRoles: ParticipantRole[] = []
  ): Promise<GameParticipant> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { resultsStatus: true, status: true },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.resultsStatus !== 'NONE' || game.status === 'ARCHIVED') {
      throw new ApiError(400, 'Cannot modify game participants when results have been entered or game is archived');
    }

    if (allowedRoles.length > 0) {
      const userParticipant = await prisma.gameParticipant.findFirst({
        where: {
          gameId,
          userId,
          role: { in: allowedRoles },
        },
      });

      if (!userParticipant) {
        const roleNames = allowedRoles.join(' or ');
        throw new ApiError(403, `Only ${roleNames} can perform this action`);
      }

      return userParticipant;
    }

    const userParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
      },
    });

    if (!userParticipant) {
      throw new ApiError(404, 'User is not a participant of this game');
    }

    return userParticipant;
  }
}

