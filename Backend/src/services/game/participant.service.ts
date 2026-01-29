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
import { ChatType } from '@prisma/client';
import { BetService } from '../bets/bet.service';

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

      // Non-playing participant trying to become playing
      await prisma.$transaction(async (tx) => {
        const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
        const joinResult = await validatePlayerCanJoinGame(currentGame, userId);

        if (!joinResult.canJoin && joinResult.shouldQueue) {
          throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
        }

        // Check if allowDirectJoin allows self-promotion
        if (!currentGame.allowDirectJoin) {
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

    if (participant.role === 'OWNER') {
      throw new ApiError(400, 'Owner cannot leave the game. Delete the game instead.');
    }

    if (participant.isPlaying) {
      await prisma.$transaction(async (tx) => {
        await tx.gameParticipant.update({
          where: { id: participant.id },
          data: { isPlaying: false },
        });

        // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry if exists
        try {
          await tx.joinQueue.deleteMany({
            where: {
              userId,
              gameId,
              status: 'PENDING',
            },
          });
        } catch (error: any) {
          // Ignore if JoinQueue table doesn't exist
          if (error.code !== 'P2021') {
            console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
          }
        }
      });

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_GAME);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      await BetService.cancelBetsWithUserInCondition(gameId, userId).catch(err =>
        console.error('Failed to cancel bets with user in condition:', err)
      );
      return 'games.leftSuccessfully';
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.gameParticipant.delete({
          where: { id: participant.id },
        });

        // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry
        try {
          await tx.joinQueue.deleteMany({
            where: {
              userId,
              gameId,
              status: 'PENDING',
            },
          });
        } catch (error: any) {
          // Ignore if JoinQueue table doesn't exist
          if (error.code !== 'P2021') {
            console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
          }
        }
      });

      await ParticipantMessageHelper.sendLeaveMessage(gameId, participant.user, SystemMessageType.USER_LEFT_CHAT);
      await GameService.updateGameReadiness(gameId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
      await BetService.cancelBetsWithUserInCondition(gameId, userId).catch(err =>
        console.error('Failed to cancel bets with user in condition:', err)
      );
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

      // NEW: Check if allowDirectJoin allows self-promotion
      if (!game.allowDirectJoin) {
        // Only owner/admin can accept non-playing participants when allowDirectJoin is false
        const isOwnerOrAdmin = participant.role === 'OWNER' || participant.role === 'ADMIN';
        if (!isOwnerOrAdmin) {
          throw new ApiError(403, 'errors.games.directJoinNotAllowed');
        }
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
      
      // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry
      try {
        await prisma.joinQueue.deleteMany({
          where: {
            userId,
            gameId,
            status: 'PENDING',
          },
        });
      } catch (error: any) {
        // Ignore if JoinQueue table doesn't exist
        if (error.code !== 'P2021') {
          console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
        }
      }
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

  // TODO: Remove after 2025-02-02 - Backward compatibility: also create JoinQueue entry
  static async addToQueueAsParticipant(gameId: string, userId: string) {
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

    validateGameCanAcceptParticipants(game);

    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: { gameId, userId },
    });

    if (existingParticipant) {
      if (existingParticipant.isPlaying) {
        throw new ApiError(400, 'Already a playing participant');
      }
      // Already in queue as non-playing participant
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

        // NEW: Create non-playing participant
        await tx.gameParticipant.create({
          data: {
            userId,
            gameId,
            role: 'PARTICIPANT',
            isPlaying: false,
          },
        });

        // TODO: Remove after 2025-02-02 - Backward compatibility: also create JoinQueue entry
        try {
          await tx.joinQueue.create({
            data: {
              userId,
              gameId,
              status: 'PENDING',
            },
          });
        } catch (error: any) {
          // Ignore if JoinQueue entry already exists or table doesn't exist
          if (error.code !== 'P2002' && error.code !== 'P2021') {
            console.warn('Failed to create backward compatibility JoinQueue entry:', error);
          }
        }
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const existingParticipant = await prisma.gameParticipant.findFirst({
          where: { gameId, userId },
        });
        if (existingParticipant && !existingParticipant.isPlaying) {
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
        isPlaying: false,
        role: 'PARTICIPANT',
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
          isPlaying: false,
        },
      });

      if (!currentParticipantEntry) {
        throw new ApiError(404, 'games.joinQueueRequestNotFound');
      }

      // Update to playing participant
      await tx.gameParticipant.update({
        where: { id: currentParticipantEntry.id },
        data: { isPlaying: true },
      });

      // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry
      try {
        await tx.joinQueue.deleteMany({
          where: {
            userId: queueUserId,
            gameId,
            status: 'PENDING',
          },
        });
      } catch (error: any) {
        // Ignore if JoinQueue table doesn't exist
        if (error.code !== 'P2021') {
          console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
        }
      }
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
        isPlaying: false,
        role: 'PARTICIPANT',
      },
    });

    if (!participant) {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    await prisma.gameParticipant.delete({
      where: { id: participant.id },
    });

    // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry
    try {
      await prisma.joinQueue.deleteMany({
        where: {
          userId: queueUserId,
          gameId,
          status: 'PENDING',
        },
      });
    } catch (error: any) {
      if (error.code !== 'P2021') {
        console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
      }
    }

    await createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_DECLINED_JOIN_QUEUE,
      queueUserId
    );

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
        isPlaying: false,
        role: 'PARTICIPANT',
      },
    });

    // TODO: Remove after 2025-02-02 - Backward compatibility: check old JoinQueue if no participant found
    const oldJoinQueue = participant ? null : await prisma.joinQueue.findFirst({
      where: {
        gameId,
        userId,
        status: 'PENDING',
      },
    });

    if (!participant && !oldJoinQueue) {
      throw new ApiError(404, 'games.joinQueueRequestNotFound');
    }

    await prisma.$transaction(async (tx) => {
      if (participant) {
        await tx.gameParticipant.delete({
          where: { id: participant.id },
        });
      }

      // TODO: Remove after 2025-02-02 - Backward compatibility: delete JoinQueue entry
      try {
        await tx.joinQueue.deleteMany({
          where: {
            userId,
            gameId,
            status: 'PENDING',
          },
        });
      } catch (error: any) {
        // Ignore if JoinQueue table doesn't exist
        if (error.code !== 'P2021') {
          console.warn('Failed to delete backward compatibility JoinQueue entry:', error);
        }
      }
    });

    await createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_CANCELED_JOIN_QUEUE,
      userId
    );

    await ParticipantMessageHelper.emitGameUpdate(gameId, userId);
    return 'games.joinRequestCanceled';
  }
}

