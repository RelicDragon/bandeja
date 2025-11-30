import prisma from '../../config/database';
import { EntityType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

export class JoinQueueService {
  static async addToQueue(gameId: string, userId: string) {
    const existingQueue = await prisma.joinQueue.findUnique({
      where: {
        userId_gameId: {
          userId,
          gameId,
        },
      },
    });

    if (existingQueue) {
      if (existingQueue.status === 'PENDING') {
        throw new ApiError(400, 'games.alreadyInJoinQueue');
      }
    } else {
      await prisma.joinQueue.create({
        data: {
          userId,
          gameId,
          status: 'PENDING',
        },
      });

      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      return 'games.addedToJoinQueue';
    }
  }

  static async acceptJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
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

    const currentParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: currentUserId,
      },
    });

    let canAccept = currentParticipant && (
      currentParticipant.role === 'OWNER' ||
      currentParticipant.role === 'ADMIN' ||
      (game.anyoneCanInvite && currentParticipant.isPlaying)
    );

    if (!canAccept) {
      canAccept = await hasParentGamePermission(gameId, currentUserId);
    }

    if (!canAccept) {
      throw new ApiError(403, 'games.notAuthorizedToAcceptJoinQueue');
    }

    if (game.entityType !== EntityType.BAR && game.participants.length >= game.maxParticipants) {
      throw new ApiError(400, 'Game is full');
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

    const queueUser = await prisma.user.findUnique({
      where: { id: queueUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: queueUserId,
      },
    });

    if (existingParticipant && existingParticipant.isPlaying) {
      await prisma.joinQueue.delete({
        where: { id: joinQueue.id },
      });
      throw new ApiError(400, 'User is already a participant');
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.joinQueue.delete({
        where: { id: joinQueue.id },
      });

      if (existingParticipant) {
        await tx.gameParticipant.update({
          where: { id: existingParticipant.id },
          data: { isPlaying: true },
        });
      } else {
        await tx.gameParticipant.create({
          data: {
            gameId,
            userId: queueUserId,
            role: 'PARTICIPANT',
            isPlaying: true,
          },
        });
      }
    });

    if (queueUser) {
      const userName = getUserDisplayName(queueUser.firstName, queueUser.lastName);
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_ACCEPTED_JOIN_QUEUE,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for join queue acceptance:', error);
      }
    }

    await ParticipantMessageHelper.sendJoinMessage(gameId, queueUserId);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    return 'games.joinRequestAccepted';
  }

  static async declineJoinQueue(gameId: string, currentUserId: string, queueUserId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const currentParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: currentUserId,
      },
    });

    let canDecline = currentParticipant && (
      currentParticipant.role === 'OWNER' ||
      currentParticipant.role === 'ADMIN' ||
      (game.anyoneCanInvite && currentParticipant.isPlaying)
    );

    if (!canDecline) {
      canDecline = await hasParentGamePermission(gameId, currentUserId);
    }

    if (!canDecline) {
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

    const queueUser = await prisma.user.findUnique({
      where: { id: queueUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    await prisma.joinQueue.delete({
      where: { id: joinQueue.id },
    });

    if (queueUser) {
      const userName = getUserDisplayName(queueUser.firstName, queueUser.lastName);
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_DECLINED_JOIN_QUEUE,
          variables: { userName }
        });
      } catch (error) {
        console.error('Failed to create system message for join queue decline:', error);
      }
    }

    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    await ParticipantMessageHelper.emitGameUpdateToUser(gameId, queueUserId);
    return 'games.joinRequestDeclined';
  }
}

