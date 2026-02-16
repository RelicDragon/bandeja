import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { SystemMessageType } from '../../utils/systemMessages';
import { GameService } from './game.service';
import { ParticipantMessageHelper } from './participantMessageHelper';
import { validatePlayerCanJoinGame, validateGameCanAcceptParticipants, canUserManageQueue } from '../../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { addOrUpdateParticipant, performPostJoinOperations } from '../../utils/participantOperations';
import { InviteService } from '../invite.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { createSystemMessageWithNotification } from '../../utils/systemMessageHelper';
import { ChatType, ParticipantRole } from '@prisma/client';
import { BetService } from '../bets/bet.service';

const PLAYING_STATUS = 'PLAYING' as const;
const IN_QUEUE_STATUS = 'IN_QUEUE' as const;
const GUEST_STATUS = 'GUEST' as const;
const INVITED_STATUS = 'INVITED' as const;

export class ParticipantService {
  static async joinGame(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { status: PLAYING_STATUS }
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
      if (existingParticipant.status === PLAYING_STATUS) {
        throw new ApiError(400, 'Already joined this game as a player');
      }
      if (existingParticipant.status === IN_QUEUE_STATUS) {
        throw new ApiError(400, 'games.alreadyInJoinQueue');
      }

      if (!game.allowDirectJoin) {
        return await this.moveExistingParticipantToQueue(gameId, userId);
      }

      const currentGame = await fetchGameWithPlayingParticipants(prisma, gameId);
      const joinResult = await validatePlayerCanJoinGame(currentGame, userId);

      if (!joinResult.canJoin && joinResult.shouldQueue) {
        return await this.moveExistingParticipantToQueue(gameId, userId);
      }

      await prisma.$transaction(async (tx) => {
        const gameInTx = await fetchGameWithPlayingParticipants(tx, gameId);
        const txJoinResult = await validatePlayerCanJoinGame(gameInTx, userId);
        if (!txJoinResult.canJoin) {
          throw new ApiError(400, txJoinResult.reason || 'errors.games.cannotAddPlayer');
        }
        if (!gameInTx.allowDirectJoin) {
          throw new ApiError(400, 'errors.games.directJoinNotAllowed');
        }
        await addOrUpdateParticipant(tx, gameId, userId);
      });

      await performPostJoinOperations(gameId, userId);
      return 'games.joinedSuccessfully';
    }

    // Check allowDirectJoin first - if false, go to queue without validation
    if (!game.allowDirectJoin) {
      // NEW: Create non-playing participant instead of joinQueue
      return await this.addToQueueAsParticipant(gameId, userId);
    }

    // Only validate if we're trying to join directly as playing participant
    const joinResult = await validatePlayerCanJoinGame(game, userId);

    if (!joinResult.canJoin && joinResult.shouldQueue) {
      // NEW: Create non-playing participant instead of joinQueue
      return await this.addToQueueAsParticipant(gameId, userId);
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

    if (participant.role === 'OWNER' && participant.status !== PLAYING_STATUS) {
      throw new ApiError(400, 'Owner cannot leave the game. Delete the game instead.');
    }

    if (participant.status === PLAYING_STATUS) {
      if (participant.role === 'OWNER') {
        await prisma.$transaction(async (tx) => {
          await tx.gameParticipant.update({
            where: { id: participant.id },
            data: { status: 'NON_PLAYING' },
          });
        });
      } else {
        await prisma.$transaction(async (tx) => {
          const game = await tx.game.findUnique({ where: { id: gameId }, select: { trainerId: true } });
          if (game?.trainerId === userId) {
            await tx.game.update({ where: { id: gameId }, data: { trainerId: null } });
          }
          await tx.gameParticipant.delete({
            where: { id: participant.id },
          });
        });
      }

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_GAME);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      await BetService.cancelBetsWithUserInCondition(gameId, userId).catch(err =>
        console.error('Failed to cancel bets with user in condition:', err)
      );
      return 'games.leftSuccessfully';
    }

    if (participant.status === GUEST_STATUS) {
      await this.leaveGuest(gameId, userId);
      return 'games.leftChatSuccessfully';
    }

    await prisma.$transaction(async (tx) => {
      // Clear trainerId if this participant is the trainer
      const game = await tx.game.findUnique({ where: { id: gameId }, select: { trainerId: true } });
      if (game?.trainerId === userId) {
        await tx.game.update({ where: { id: gameId }, data: { trainerId: null } });
      }
      await tx.gameParticipant.delete({
        where: { id: participant.id },
      });
    });

    await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    await BetService.cancelBetsWithUserInCondition(gameId, userId).catch(err =>
      console.error('Failed to cancel bets with user in condition:', err)
    );
    return 'games.leftChatSuccessfully';
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
      if (existingParticipant.status === GUEST_STATUS) {
        return 'games.joinedChatAsGuest';
      }
      if (existingParticipant.status === PLAYING_STATUS) {
        throw new ApiError(400, 'Already joined this game as a player');
      }
      throw new ApiError(400, 'Already a participant of this game');
    }

    await prisma.gameParticipant.create({
      data: {
        gameId,
        userId,
        role: 'PARTICIPANT',
        status: GUEST_STATUS,
      },
    });

    await ParticipantMessageHelper.sendJoinMessage(gameId, userId, SystemMessageType.USER_JOINED_CHAT);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return 'games.joinedChatAsGuest';
  }

  static async leaveGuest(gameId: string, userId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: { gameId, userId, status: GUEST_STATUS },
      include: {
        user: { select: USER_SELECT_FIELDS },
      },
    });

    if (!participant) {
      throw new ApiError(404, 'Not in chat as guest');
    }

    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { status: 'NON_PLAYING' },
      });
      await GameService.updateGameReadiness(gameId);
    } else {
      await prisma.gameParticipant.delete({
        where: { id: participant.id },
      });
    }

    await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
  }

  static async togglePlayingStatus(gameId: string, userId: string, status: 'PLAYING' | 'IN_QUEUE') {
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

    const isPlaying = status === PLAYING_STATUS;
    const newStatus = status;

    if (isPlaying && participant.status !== PLAYING_STATUS) {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          participants: {
            where: { status: PLAYING_STATUS },
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

      if (!game.allowDirectJoin) {
        const isOwnerOrAdmin = participant.role === 'OWNER' || participant.role === 'ADMIN';
        if (!isOwnerOrAdmin) {
          return await this.moveExistingParticipantToQueue(gameId, userId);
        }
      }

      const joinResult = await validatePlayerCanJoinGame(game, userId);
      if (!joinResult.canJoin) {
        return await this.moveExistingParticipantToQueue(gameId, userId);
      }
    }

    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: {
        status: newStatus,
        invitedByUserId: null,
        inviteMessage: null,
        inviteExpiresAt: null,
      },
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

  static async moveExistingParticipantToQueue(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new ApiError(404, 'Game not found');
    validateGameCanAcceptParticipants(game);

    await prisma.gameParticipant.updateMany({
      where: { gameId, userId },
      data: { status: IN_QUEUE_STATUS },
    });

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

  static async addToQueueAsParticipant(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { status: PLAYING_STATUS }
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    validateGameCanAcceptParticipants(game);

    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: { gameId, userId },
    });

    if (existingParticipant) {
      if (existingParticipant.status === PLAYING_STATUS) {
        throw new ApiError(400, 'Already a playing participant');
      }
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

        await tx.gameParticipant.create({
          data: {
            userId,
            gameId,
            role: 'PARTICIPANT',
            status: IN_QUEUE_STATUS,
          },
        });
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const existingParticipant = await prisma.gameParticipant.findFirst({
          where: { gameId, userId },
        });
        if (existingParticipant && existingParticipant.status !== PLAYING_STATUS) {
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

  static async acceptNonPlayingParticipant(gameId: string, currentUserId: string, queueUserId: string) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: queueUserId,
        status: IN_QUEUE_STATUS,
      },
    });

    if (!participant) {
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

      const currentParticipantEntry = await tx.gameParticipant.findFirst({
        where: {
          gameId,
          userId: queueUserId,
          status: IN_QUEUE_STATUS,
        },
      });

      if (!currentParticipantEntry) {
        throw new ApiError(404, 'games.joinQueueRequestNotFound');
      }

      await tx.gameParticipant.update({
        where: { id: currentParticipantEntry.id },
        data: {
          status: PLAYING_STATUS,
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
        },
      });
    });

    await ParticipantMessageHelper.sendJoinMessage(gameId, queueUserId);
    await InviteService.deleteInvitesForUserInGame(gameId, queueUserId);
    await GameService.updateGameReadiness(gameId);
    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    return 'games.joinRequestAccepted';
  }

  static async declineNonPlayingParticipant(gameId: string, currentUserId: string, queueUserId: string) {
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

    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: queueUserId,
        status: IN_QUEUE_STATUS,
      },
    });

    if (!participant) {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({
        where: { id: participant.id },
        data: { status: 'NON_PLAYING' },
      });
      await GameService.updateGameReadiness(gameId);
    } else {
      await prisma.gameParticipant.delete({
        where: { id: participant.id },
      });
      await createSystemMessageWithNotification(
        gameId,
        SystemMessageType.USER_DECLINED_JOIN_QUEUE,
        queueUserId
      );
    }

    await ParticipantMessageHelper.emitGameUpdate(gameId, currentUserId);
    await ParticipantMessageHelper.emitGameUpdateToUser(gameId, queueUserId);
    return 'games.joinRequestDeclined';
  }

  static async cancelNonPlayingParticipant(gameId: string, userId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId,
        status: IN_QUEUE_STATUS,
      },
    });

    if (!participant) {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }
    if (participant.role === ParticipantRole.OWNER) {
      throw new ApiError(400, 'games.ownerCannotCancelQueue');
    }

    await prisma.gameParticipant.delete({
      where: { id: participant.id },
    });

    await createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_CANCELED_JOIN_QUEUE,
      userId
    );

    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return 'games.joinRequestCanceled';
  }

  static async sendInvite(
    gameId: string,
    senderId: string,
    receiverId: string,
    message?: string | null,
    expiresAt?: Date | null,
    asTrainer?: boolean
  ): Promise<{ participant: any; invite: any }> {
    const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { entityType: true, status: true } });
    validateGameCanAcceptParticipants(game);
    if (asTrainer && game.entityType !== 'TRAINING') {
      throw new ApiError(400, 'Only training games can have a trainer');
    }

    const participant = await prisma.$transaction(async (tx) => {
      const existing = await tx.gameParticipant.findFirst({
        where: { gameId, userId: receiverId },
      });
      if (existing) {
        if (existing.status === INVITED_STATUS) {
          throw new ApiError(400, 'errors.invites.alreadySent');
        }
        if (existing.status === PLAYING_STATUS) {
          throw new ApiError(400, 'Already a playing participant');
        }
        throw new ApiError(400, 'errors.invites.alreadySent');
      }

      if (asTrainer) {
        const [existingGame, pendingTrainerInvite] = await Promise.all([
          tx.game.findUnique({ where: { id: gameId }, select: { trainerId: true } }),
          tx.gameParticipant.findFirst({ where: { gameId, role: 'ADMIN', status: 'INVITED' } }),
        ]);
        if (existingGame?.trainerId || pendingTrainerInvite) {
          throw new ApiError(400, 'This training already has a trainer or a pending trainer invite');
        }
      }

      return tx.gameParticipant.create({
        data: {
          gameId,
          userId: receiverId,
          role: asTrainer ? 'ADMIN' : 'PARTICIPANT',
          status: INVITED_STATUS,
          invitedByUserId: senderId,
          inviteMessage: message ?? null,
          inviteExpiresAt: expiresAt ?? null,
        },
        include: {
          user: { select: USER_SELECT_FIELDS },
          invitedByUser: { select: USER_SELECT_FIELDS },
          game: {
            select: {
              id: true,
              name: true,
              gameType: true,
              startTime: true,
              endTime: true,
              maxParticipants: true,
              minParticipants: true,
              minLevel: true,
              maxLevel: true,
              isPublic: true,
              affectsRating: true,
              hasBookedCourt: true,
              afterGameGoToBar: true,
              hasFixedTeams: true,
              teamsReady: true,
              participantsReady: true,
              status: true,
              resultsStatus: true,
              entityType: true,
              court: { select: { id: true, name: true, club: { select: { id: true, name: true } } } },
              club: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    const invite = {
      id: participant.id,
      receiverId: participant.userId,
      gameId: participant.gameId,
      status: 'PENDING',
      message: participant.inviteMessage,
      expiresAt: participant.inviteExpiresAt,
      createdAt: participant.joinedAt,
      updatedAt: participant.joinedAt,
      receiver: participant.user,
      sender: participant.invitedByUser,
      game: participant.game,
    };
    return { participant, invite };
  }
}

