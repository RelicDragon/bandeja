import prisma from '../../config/database';
import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { createSystemMessage } from '../../controllers/chat.controller';

export class OwnershipService {
  static async transferOwnership(gameId: string, currentOwnerId: string, newOwnerId: string) {
    const owner = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: currentOwnerId,
        role: ParticipantRole.OWNER,
      },
    });

    if (!owner) {
      throw new ApiError(404, 'User is not the owner of this game');
    }

    const newOwnerParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: newOwnerId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!newOwnerParticipant) {
      throw new ApiError(404, 'User is not a participant of this game');
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.gameParticipant.update({
        where: { id: owner.id },
        data: { role: ParticipantRole.ADMIN },
      });

      await tx.gameParticipant.update({
        where: { id: newOwnerParticipant.id },
        data: { role: ParticipantRole.OWNER },
      });
    });

    if (newOwnerParticipant.user) {
      const newOwnerName = getUserDisplayName(newOwnerParticipant.user.firstName, newOwnerParticipant.user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.OWNERSHIP_TRANSFERRED,
          variables: { newOwnerName }
        });
      } catch (error) {
        console.error('Failed to create system message for ownership transfer:', error);
      }
    }

    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, currentOwnerId);
    return 'Ownership transferred successfully';
  }
}

