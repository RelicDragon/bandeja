import prisma from '../config/database';
import { ParticipantRole, EntityType } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { createSystemMessage } from '../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { GameService } from './game.service';

export class GameParticipantService {
  static async joinGame(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { isPlaying: true }
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    // Check if user is already a participant (playing or non-playing)
    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
      },
    });

    if (existingParticipant) {
      if (existingParticipant.isPlaying) {
        throw new ApiError(400, 'Already joined this game as a player');
      } else {
        // Upgrade guest to participant
        if (game.entityType !== EntityType.BAR && game.participants.length >= game.maxParticipants) {
          throw new ApiError(400, 'Game is full');
        }

        await prisma.gameParticipant.update({
          where: { id: existingParticipant.id },
          data: { isPlaying: true },
        });

        await this.sendJoinMessage(gameId, userId);
        await GameService.updateGameReadiness(gameId);
        return 'Successfully joined the game';
      }
    }

    if (game.entityType !== EntityType.BAR && game.participants.length >= game.maxParticipants) {
      throw new ApiError(400, 'Game is full');
    }

    await prisma.gameParticipant.create({
      data: {
        gameId,
        userId,
        role: 'PARTICIPANT',
        isPlaying: true,
      },
    });

    await this.sendJoinMessage(gameId, userId);
    await GameService.updateGameReadiness(gameId);
    return 'Successfully joined the game';
  }

  static async leaveGame(gameId: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
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
      throw new ApiError(404, 'Not a participant of this game');
    }

    if (participant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'Owner cannot leave the game. Delete the game instead.');
    }

    if (participant.isPlaying) {
      // If playing, set to non-playing (guest)
      await prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { isPlaying: false },
      });

      await this.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_GAME);
      await GameService.updateGameReadiness(gameId);
      return 'Successfully left the game';
    } else {
      // If not playing (guest), remove from game entirely
      await prisma.gameParticipant.delete({
        where: { id: participant.id },
      });

      await this.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
      await GameService.updateGameReadiness(gameId);
      return 'Successfully left the chat';
    }
  }

  static async joinAsGuest(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    // Check if user is already a participant (playing or non-playing)
    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
      },
    });

    if (existingParticipant) {
      if (!existingParticipant.isPlaying) {
        throw new ApiError(400, 'Already joined this game as a guest');
      } else {
        throw new ApiError(400, 'Already joined this game as a player');
      }
    }

    await prisma.gameParticipant.create({
      data: {
        gameId,
        userId,
        role: 'PARTICIPANT',
        isPlaying: false,
      },
    });

    await this.sendJoinMessage(gameId, userId, SystemMessageType.USER_JOINED_CHAT);
    await GameService.updateGameReadiness(gameId);
    return 'Successfully joined the chat as a guest';
  }

  static async togglePlayingStatus(gameId: string, userId: string, isPlaying: boolean) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
        role: 'PARTICIPANT',
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
      throw new ApiError(404, 'Not a participant of this game');
    }

    // If trying to set isPlaying to true, check game capacity
    if (isPlaying && !participant.isPlaying) {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            where: { isPlaying: true }
          },
        },
      });

      if (game && game.entityType !== EntityType.BAR && game.participants.length >= game.maxParticipants) {
        throw new ApiError(400, 'Game is full');
      }
    }

    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { isPlaying },
    });

    // Send system message to game chat
    if (participant.user) {
      const userName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      const action = isPlaying ? 'joined the game' : 'left the game';

      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_TOGGLE_PLAYING_STATUS,
          variables: { userName, action }
        });
      } catch (error) {
        console.error('Failed to create system message for playing status change:', error);
      }
    }

    await GameService.updateGameReadiness(gameId);
    return `Successfully ${isPlaying ? 'joined' : 'left'} the game`;
  }

  static async addAdmin(gameId: string, ownerId: string, userId: string) {
    const owner = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: ownerId,
        role: 'OWNER',
      },
    });

    if (!owner) {
      throw new ApiError(403, 'Only the owner can add admins');
    }

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

    await this.sendPromotionMessage(gameId, participant.user, SystemMessageType.USER_PROMOTED_TO_ADMIN);
    return 'Admin added successfully';
  }

  static async revokeAdmin(gameId: string, ownerId: string, userId: string) {
    const owner = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: ownerId,
        role: 'OWNER',
      },
    });

    if (!owner) {
      throw new ApiError(403, 'Only the owner can revoke admin privileges');
    }

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

    await this.sendPromotionMessage(gameId, participant.user, SystemMessageType.USER_REVOKED_ADMIN);
    return 'Admin privileges revoked successfully';
  }

  static async kickUser(gameId: string, currentUserId: string, targetUserId: string) {
    const currentUserParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: currentUserId,
        role: { in: ['OWNER', 'ADMIN'] },
      },
    });

    if (!currentUserParticipant) {
      throw new ApiError(403, 'Only owners and admins can kick users');
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

    // Owners can kick anyone, admins can only kick participants/guests
    if (currentUserParticipant.role === ParticipantRole.ADMIN && 
        targetParticipant.role === ParticipantRole.OWNER) {
      throw new ApiError(403, 'Admins cannot kick the owner');
    }

    await prisma.gameParticipant.delete({
      where: { id: targetParticipant.id },
    });

    await this.sendKickMessage(gameId, targetParticipant.user);
    await GameService.updateGameReadiness(gameId);
    return 'User kicked successfully';
  }

  static async transferOwnership(gameId: string, currentOwnerId: string, newOwnerId: string) {
    const owner = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: currentOwnerId,
        role: 'OWNER',
      },
    });

    if (!owner) {
      throw new ApiError(403, 'Only the owner can transfer ownership');
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

    // Transfer ownership in a transaction
    await prisma.$transaction(async (tx: any) => {
      // Demote current owner to admin
      await tx.gameParticipant.update({
        where: { id: owner.id },
        data: { role: ParticipantRole.ADMIN },
      });

      // Promote new owner
      await tx.gameParticipant.update({
        where: { id: newOwnerParticipant.id },
        data: { role: ParticipantRole.OWNER },
      });
    });

    await this.sendOwnershipTransferMessage(gameId, newOwnerParticipant.user);
    await GameService.updateGameReadiness(gameId);
    return 'Ownership transferred successfully';
  }

  private static async sendJoinMessage(gameId: string, userId: string, messageType = SystemMessageType.USER_JOINED_GAME) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: messageType,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for game join:', error);
      }
    }
  }

  private static async sendLeaveMessage(gameId: string, user: any, messageType: SystemMessageType) {
    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: messageType,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for game leave:', error);
      }
    }
  }

  private static async sendPromotionMessage(gameId: string, user: any, messageType: SystemMessageType) {
    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: messageType,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for admin promotion:', error);
      }
    }
  }

  private static async sendKickMessage(gameId: string, user: any) {
    if (user) {
      const userName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_KICKED,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for user kick:', error);
      }
    }
  }

  private static async sendOwnershipTransferMessage(gameId: string, user: any) {
    if (user) {
      const newOwnerName = getUserDisplayName(user.firstName, user.lastName);
      
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.OWNERSHIP_TRANSFERRED,
          variables: { newOwnerName }
        });
      } catch (error) {
        console.error('Failed to create system message for ownership transfer:', error);
      }
    }
  }
}
