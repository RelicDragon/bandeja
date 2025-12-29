import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { JoinQueueService } from './joinQueue.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { canAddPlayerToGame } from '../../utils/participantValidation';
import { InviteService } from '../invite.service';

export class ParticipantService {
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
        await canAddPlayerToGame(game, userId);

        await prisma.gameParticipant.update({
          where: { id: existingParticipant.id },
          data: { isPlaying: true },
        });

        await InviteService.deleteInvitesForUserInGame(gameId, userId);
        await ParticipantMessageHelper.sendJoinMessage(gameId, userId);
        await GameService.updateGameReadiness(gameId);
        return 'Successfully joined the game';
      }
    }

    await canAddPlayerToGame(game, userId);

    if (!game.allowDirectJoin) {
      return await JoinQueueService.addToQueue(gameId, userId);
    }

    await prisma.gameParticipant.create({
      data: {
        gameId,
        userId,
        role: 'PARTICIPANT',
        isPlaying: true,
      },
    });

    await InviteService.deleteInvitesForUserInGame(gameId, userId);
    await ParticipantMessageHelper.sendJoinMessage(gameId, userId);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
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

    if (participant.role === 'OWNER') {
      throw new ApiError(400, 'Owner cannot leave the game. Delete the game instead.');
    }

    if (participant.isPlaying) {
      await prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { isPlaying: false },
      });

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_GAME);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      return 'Successfully left the game';
    } else {
      await prisma.gameParticipant.delete({
        where: { id: participant.id },
      });

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
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

    await ParticipantMessageHelper.sendJoinMessage(gameId, userId, SystemMessageType.USER_JOINED_CHAT);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return 'Successfully joined the chat as a guest';
  }

  static async togglePlayingStatus(gameId: string, userId: string, isPlaying: boolean) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId
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

    if (isPlaying && !participant.isPlaying) {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            where: { isPlaying: true },
            include: {
              user: {
                select: {
                  gender: true,
                },
              },
            },
          },
        },
      });

      if (game) {
        await canAddPlayerToGame(game, userId);
      }
    }

    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { isPlaying },
    });

    if (isPlaying) {
      await InviteService.deleteInvitesForUserInGame(gameId, userId);
    }

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
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return `Successfully ${isPlaying ? 'joined' : 'left'} the game`;
  }
}

