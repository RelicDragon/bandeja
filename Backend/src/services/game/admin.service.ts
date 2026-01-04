import prisma from '../../config/database';
import { ParticipantRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { createSystemMessage } from '../../controllers/chat.controller';
import { hasParentGamePermission, getParentGameParticipant } from '../../utils/parentGamePermissions';

export class AdminService {
  static async addAdmin(gameId: string, ownerId: string, userId: string) {

    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: userId,
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

    if (!participant) {
      throw new ApiError(404, 'User is not a participant of this game');
    }

    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { role: ParticipantRole.ADMIN },
    });

    if (participant.user) {
      const userName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_PROMOTED_TO_ADMIN,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for admin promotion:', error);
      }
    }

    await ParticipantMessageHelper.emitGameUpdate(gameId, ownerId);
    return 'Admin added successfully';
  }

  static async revokeAdmin(gameId: string, ownerId: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: userId,
        role: 'ADMIN',
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

    if (!participant) {
      throw new ApiError(404, 'User is not an admin of this game');
    }

    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { role: ParticipantRole.PARTICIPANT },
    });

    if (participant.user) {
      const userName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_REVOKED_ADMIN,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for admin revoke:', error);
      }
    }

    await ParticipantMessageHelper.emitGameUpdate(gameId, ownerId);
    return 'Admin privileges revoked successfully';
  }

  static async kickUser(gameId: string, currentUserId: string, targetUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { isAdmin: true },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const hasPermission = await hasParentGamePermission(
      gameId,
      currentUserId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN],
      user.isAdmin
    );

    if (!hasPermission) {
      throw new ApiError(403, 'User is not an owner or admin of this game');
    }

    const targetParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: targetUserId,
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

    if (!targetParticipant) {
      throw new ApiError(404, 'User is not a participant of this game');
    }

    if (!user.isAdmin) {
      const currentUserParticipantInfo = await getParentGameParticipant(
        gameId,
        currentUserId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN]
      );

      if (currentUserParticipantInfo && 
          currentUserParticipantInfo.participant.role === ParticipantRole.ADMIN && 
          targetParticipant.role === ParticipantRole.OWNER) {
        throw new ApiError(403, 'Admins cannot kick the owner');
      }
    }

    await prisma.gameParticipant.delete({
      where: { id: targetParticipant.id },
    });

    if (targetParticipant.user) {
      const userName = getUserDisplayName(targetParticipant.user.firstName, targetParticipant.user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_KICKED,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for user kick:', error);
      }
    }

    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    return 'User kicked successfully';
  }
}

