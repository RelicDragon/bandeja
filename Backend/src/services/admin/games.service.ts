import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { GameService } from '../game/game.service';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { canAddPlayerToGame, validateGenderForGame } from '../../utils/participantValidation';
import { getUserTimezoneFromCityId } from '../user-timezone.service';

export class AdminGamesService {
  static async getAllGames(cityId?: string) {
    const games = await prisma.game.findMany({
      where: cityId ? {
        cityId: cityId,
      } : undefined,
      include: {
        court: {
          include: {
            club: {
              include: {
                city: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                ...USER_SELECT_FIELDS,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: 'desc' },
      take: 100,
    });

    return games;
  }

  static async getAllInvites(cityId?: string) {
    const participants = await prisma.gameParticipant.findMany({
      where: {
        status: 'INVITED',
        game: {
          status: { not: 'ARCHIVED' },
          ...(cityId && { cityId }),
        },
      },
      include: {
        invitedByUser: {
          select: { ...USER_SELECT_FIELDS, phone: true },
        },
        user: {
          select: { ...USER_SELECT_FIELDS, phone: true },
        },
        game: {
          select: {
            id: true,
            name: true,
            gameType: true,
            startTime: true,
            endTime: true,
            status: true,
            court: {
              include: {
                club: {
                  include: {
                    city: {
                      select: { id: true, name: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return participants.map((p) => ({
      id: p.id,
      receiverId: p.userId,
      senderId: p.invitedByUserId,
      gameId: p.gameId,
      status: 'PENDING',
      message: p.inviteMessage,
      expiresAt: p.inviteExpiresAt,
      createdAt: p.joinedAt,
      receiver: p.user,
      sender: p.invitedByUser,
      game: p.game,
    }));
  }

  static async acceptInvite(participantId: string) {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        game: { include: { participants: true } },
      },
    });
    if (!participant || participant.status !== 'INVITED') {
      throw new ApiError(404, 'Invite not found');
    }
    const gameId = participant.gameId;
    const receiverId = participant.userId;
    if (gameId && participant.game) {
      await validateGenderForGame(participant.game, receiverId);
      const existingParticipant = participant.game.participants.find((p) => p.userId === receiverId);
      if (existingParticipant) {
        if (existingParticipant.status === 'PLAYING') {
          return { message: 'invites.acceptedSuccessfully', gameId };
        }
        const joinResult = await canAddPlayerToGame(participant.game, receiverId);
        if (!joinResult.canJoin && joinResult.shouldQueue) {
          await prisma.gameParticipant.update({
            where: { id: participantId },
            data: {
              status: 'IN_QUEUE',
              invitedByUserId: null,
              inviteMessage: null,
              inviteExpiresAt: null,
            },
          });
          await GameService.updateGameReadiness(gameId);
          return { message: 'games.addedToJoinQueue', gameId };
        }
        await prisma.gameParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            status: 'PLAYING',
            invitedByUserId: null,
            inviteMessage: null,
            inviteExpiresAt: null,
          },
        });
        await GameService.updateGameReadiness(gameId);
      } else {
        const joinResult = await canAddPlayerToGame(participant.game, receiverId);
        if (!joinResult.canJoin && joinResult.shouldQueue) {
          await prisma.gameParticipant.update({
            where: { id: participantId },
            data: {
              status: 'IN_QUEUE',
              invitedByUserId: null,
              inviteMessage: null,
              inviteExpiresAt: null,
            },
          });
          await GameService.updateGameReadiness(gameId);
          return { message: 'games.addedToJoinQueue', gameId };
        }
        await prisma.gameParticipant.update({
          where: { id: participantId },
          data: { status: 'PLAYING', role: 'PARTICIPANT' },
        });
        await GameService.updateGameReadiness(gameId);
      }
    }
    if (gameId && participant.user) {
      const receiverName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      try {
        await createSystemMessage(gameId, {
          type: SystemMessageType.USER_ACCEPTED_INVITE,
          variables: { userName: receiverName },
        });
      } catch (error) {
        console.error('Failed to create system message for invite acceptance:', error);
      }
    }
    return { message: 'invites.acceptedSuccessfully', gameId };
  }

  static async declineInvite(participantId: string) {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!participant || participant.status !== 'INVITED') {
      throw new ApiError(404, 'Invite not found');
    }
    if (participant.gameId && participant.user) {
      const receiverName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      try {
        await createSystemMessage(participant.gameId, {
          type: SystemMessageType.USER_DECLINED_INVITE,
          variables: { userName: receiverName },
        });
      } catch (error) {
        console.error('Failed to create system message for invite decline:', error);
      }
    }
    await prisma.gameParticipant.delete({ where: { id: participantId } });
    return { message: 'invites.declinedSuccessfully' };
  }

  static async resetGameResults(gameId: string, _adminUserId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        participants: true,
        outcomes: true,
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (game.status === 'ARCHIVED') {
      throw new ApiError(403, 'Cannot reset results for archived games');
    }

    await prisma.$transaction(async (tx) => {
      if (game.affectsRating && game.outcomes.length > 0) {
        const { LeagueGameResultsService } = await import('../league/gameResults.service');
        await LeagueGameResultsService.unsyncGameResults(gameId, tx);

        for (const outcome of game.outcomes) {
          await tx.user.update({
            where: { id: outcome.userId },
            data: {
              level: Math.max(1.0, Math.min(7.0, outcome.levelBefore)),
              reliability: outcome.reliabilityBefore,
              totalPoints: { decrement: outcome.pointsEarned },
              gamesPlayed: { decrement: 1 },
              gamesWon: outcome.isWinner ? { decrement: 1 } : undefined,
            },
          });
        }
      }

      await tx.roundOutcome.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });

      await tx.set.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.teamPlayer.deleteMany({
        where: {
          team: {
            match: {
              round: {
                gameId,
              },
            },
          },
        },
      });
      
      await tx.team.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.match.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });

      await tx.round.deleteMany({
        where: { gameId },
      });

      await tx.gameOutcome.deleteMany({
        where: { gameId },
      });

      await tx.levelChangeEvent.deleteMany({
        where: {
          gameId: gameId,
        },
      });

      const updatedGame = await tx.game.findUnique({
        where: { id: gameId },
        select: { startTime: true, endTime: true, cityId: true, timeIsSet: true, entityType: true },
      });
      
      if (updatedGame) {
        const cityTimezone = await getUserTimezoneFromCityId(updatedGame.cityId);
        const { calculateGameStatus } = await import('../../utils/gameStatus');
        await tx.game.update({
          where: { id: gameId },
          data: {
            resultsStatus: 'NONE',
            metadata: {
              ...((game.metadata as any) || {}),
            },
            status: calculateGameStatus({
              startTime: updatedGame.startTime,
              endTime: updatedGame.endTime,
              resultsStatus: 'NONE',
              timeIsSet: updatedGame.timeIsSet,
              entityType: updatedGame.entityType,
            }, cityTimezone),
          },
        });
      }
    });

    return { message: 'Game results reset successfully' };
  }
}
