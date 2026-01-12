import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { JoinQueueService } from './joinQueue.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { validatePlayerCanJoinGame, validateGameCanAcceptParticipants } from '../../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { addOrUpdateParticipant, performPostJoinOperations } from '../../utils/participantOperations';
import { InviteService } from '../invite.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

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
      }

      await prisma.$transaction(async (tx) => {
        const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
        const joinResult = await validatePlayerCanJoinGame(currentGame, userId);

        if (!joinResult.canJoin && joinResult.shouldQueue) {
          throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
        }

        await addOrUpdateParticipant(tx, gameId, userId);
      });

      await performPostJoinOperations(gameId, userId);
      return 'games.joinedSuccessfully';
    }

    const joinResult = await validatePlayerCanJoinGame(game, userId);

    if (!joinResult.canJoin && joinResult.shouldQueue) {
      return await JoinQueueService.addToQueue(gameId, userId);
    }

    if (!game.allowDirectJoin) {
      return await JoinQueueService.addToQueue(gameId, userId);
    }

    await prisma.$transaction(async (tx) => {
      const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
      const currentJoinResult = await validatePlayerCanJoinGame(currentGame, userId);

      if (!currentJoinResult.canJoin) {
        throw new ApiError(400, currentJoinResult.reason || 'errors.games.cannotAddPlayer');
      }

      if (!currentGame.allowDirectJoin) {
        throw new ApiError(400, 'errors.games.directJoinNotAllowed');
      }

      await addOrUpdateParticipant(tx, gameId, userId);
    });

    await performPostJoinOperations(gameId, userId);
    return 'games.joinedSuccessfully';
  }

  static async leaveGame(gameId: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS,
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
      return 'games.leftSuccessfully';
    } else {
      await prisma.gameParticipant.delete({
        where: { id: participant.id },
      });

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      return 'games.leftChatSuccessfully';
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

    validateGameCanAcceptParticipants(game);

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
    return 'games.joinedChatAsGuest';
  }

  static async togglePlayingStatus(gameId: string, userId: string, isPlaying: boolean) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS,
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

      if (!game) {
        throw new ApiError(404, 'Game not found');
      }

      const joinResult = await validatePlayerCanJoinGame(game, userId);
      if (!joinResult.canJoin) {
        throw new ApiError(400, joinResult.reason || 'errors.games.cannotJoin');
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
      if (isPlaying) {
        await ParticipantMessageHelper.sendJoinMessage(gameId, userId);
      } else {
        await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_GAME);
      }
    }

    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return isPlaying ? 'games.joinedSuccessfully' : 'games.leftSuccessfully';
  }
}

