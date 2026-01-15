import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { validatePlayerCanJoinGame, validateGameCanAcceptParticipants, canUserManageQueue } from '../../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { createSystemMessageWithNotification } from '../../utils/systemMessageHelper';
import { addOrUpdateParticipant } from '../../utils/participantOperations';
import { InviteService } from '../invite.service';
import { ChatType } from '@prisma/client';

export class JoinQueueService {
  static async addToQueue(gameId: string, userId: string) {
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

    await validatePlayerCanJoinGame(game, userId);

    const existingQueue = await prisma.joinQueue.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
    });

    if (existingQueue?.status === 'PENDING') {
      throw new ApiError(400, 'games.alreadyInJoinQueue');
    }

    try {
      await prisma.$transaction(async (tx) => {
        const currentGame = await tx.game.findUnique({
          where: { id: gameId },
        });

        if (!currentGame) {
          throw new ApiError(404, 'Game not found');
        }

        validateGameCanAcceptParticipants(currentGame);

        await tx.joinQueue.create({
          data: {
            userId,
            gameId,
            status: 'PENDING',
          },
        });
      });
    } catch (error: any) {
      if (error.code === 'P2025' || error.code === 'P2002') {
        const existingQueueCheck = await prisma.joinQueue.findUnique({
          where: {
            userId_gameId: {
              userId,
              gameId,
            },
          },
        });

        if (existingQueueCheck?.status === 'PENDING') {
          throw new ApiError(400, 'games.alreadyInJoinQueue');
        }
      }
      throw error;
    }

    await createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_JOINED_JOIN_QUEUE,
      userId,
      ChatType.ADMINS
    );

    await InviteService.deleteInvitesForUserInGame(gameId, userId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return 'games.addedToJoinQueue';
  }

  static async acceptJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    const joinQueue = await prisma.joinQueue.findUnique({
      where: {
        userId_gameId: {
          userId: queueUserId,
          gameId,
        },
      },
    });

    if (!joinQueue || joinQueue.status !== 'PENDING') {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    await prisma.$transaction(async (tx: any) => {
      const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);

      const currentParticipant = await tx.gameParticipant.findFirst({
        where: { gameId, userId: currentUserId },
      });

      if (!canUserManageQueue(currentParticipant, currentGame)) {
        throw new ApiError(403, 'games.notAuthorizedToAcceptJoinQueue');
      }

      const joinResult = await validatePlayerCanJoinGame(currentGame, queueUserId);
      if (!joinResult.canJoin) {
        throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
      }

      const currentJoinQueue = await tx.joinQueue.findUnique({
        where: {
          userId_gameId: {
            userId: queueUserId,
            gameId,
          },
        },
      });

      if (!currentJoinQueue || currentJoinQueue.status !== 'PENDING') {
        throw new ApiError(404, 'games.joinQueueRequestNotFound');
      }

      const existingParticipant = await tx.gameParticipant.findFirst({
        where: { gameId, userId: queueUserId },
      });

      if (existingParticipant && existingParticipant.isPlaying) {
        await tx.joinQueue.delete({
          where: { id: currentJoinQueue.id },
        });
        throw new ApiError(400, 'errors.games.alreadyParticipant');
      }

      await tx.joinQueue.delete({
        where: { id: currentJoinQueue.id },
      });

      await addOrUpdateParticipant(tx, gameId, queueUserId);
    });

    await ParticipantMessageHelper.sendJoinMessage(gameId, queueUserId);
    await InviteService.deleteInvitesForUserInGame(gameId, queueUserId);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    return 'games.joinRequestAccepted';
  }

  static async declineJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        anyoneCanInvite: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const currentParticipant = await prisma.gameParticipant.findFirst({
      where: { gameId, userId: currentUserId },
    });

    if (!canUserManageQueue(currentParticipant, game)) {
      throw new ApiError(403, 'games.notAuthorizedToDeclineJoinQueue');
    }

    const joinQueue = await prisma.joinQueue.findUnique({
      where: {
        userId_gameId: {
          userId: queueUserId,
          gameId,
        },
      },
    });

    if (!joinQueue || joinQueue.status !== 'PENDING') {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    await prisma.joinQueue.delete({
      where: { id: joinQueue.id },
    });

    await createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_DECLINED_JOIN_QUEUE,
      queueUserId
    );

    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    await ParticipantMessageHelper.emitGameUpdateToUser(gameId, queueUserId);
    return 'games.joinRequestDeclined';
  }
}

