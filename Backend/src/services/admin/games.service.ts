import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { GameService } from '../game/game.service';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { canAddPlayerToGame, validateGenderForGame } from '../../utils/participantValidation';
import { JoinQueueService } from '../game/joinQueue.service';
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
    const invites = await prisma.invite.findMany({
      where: {
        status: 'PENDING',
        game: {
          ...(cityId && {
            court: {
              club: {
                cityId: cityId,
              },
            },
          }),
          status: {
            not: 'ARCHIVED',
          },
        },
      },
      include: {
        sender: {
          select: {
            ...USER_SELECT_FIELDS,
            phone: true,
          },
        },
        receiver: {
          select: {
            ...USER_SELECT_FIELDS,
            phone: true,
          },
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
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invites;
  }

  static async acceptInvite(inviteId: string) {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        game: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!invite) {
      throw new ApiError(404, 'Invite not found');
    }

    if (invite.status !== 'PENDING') {
      throw new ApiError(400, 'Invite has already been processed');
    }

    if (invite.gameId && invite.game) {
      await validateGenderForGame(invite.game, invite.receiverId);

      const existingParticipant = invite.game.participants.find(
        p => p.userId === invite.receiverId
      );

      if (existingParticipant) {
        if (existingParticipant.isPlaying) {
          // Already a playing participant, nothing to do
        } else {
          // Existing non-playing participant, validate and update to playing or add to queue
          const joinResult = await canAddPlayerToGame(invite.game, invite.receiverId);

          if (!joinResult.canJoin && joinResult.shouldQueue) {
            await JoinQueueService.addToQueue(invite.gameId, invite.receiverId);
            await prisma.invite.delete({
              where: { id: inviteId },
            });
            return { message: 'games.addedToJoinQueue' };
          }

          await prisma.gameParticipant.update({
            where: { id: existingParticipant.id },
            data: { isPlaying: true },
          });
          await GameService.updateGameReadiness(invite.gameId);
        }
      } else {
        // No existing participant, validate and create as playing or add to queue
        const joinResult = await canAddPlayerToGame(invite.game, invite.receiverId);

        if (!joinResult.canJoin && joinResult.shouldQueue) {
          await JoinQueueService.addToQueue(invite.gameId, invite.receiverId);
          await prisma.invite.delete({
            where: { id: inviteId },
          });
          return { message: 'games.addedToJoinQueue' };
        }

        await prisma.gameParticipant.create({
          data: {
            gameId: invite.gameId,
            userId: invite.receiverId,
            role: 'PARTICIPANT',
            isPlaying: true,
          },
        });
        await GameService.updateGameReadiness(invite.gameId);
      }
    }

    if (invite.gameId && invite.receiver) {
      const receiverName = getUserDisplayName(invite.receiver.firstName, invite.receiver.lastName);
      
      try {
        await createSystemMessage(invite.gameId, {
          type: SystemMessageType.USER_ACCEPTED_INVITE,
          variables: { userName: receiverName }
        });
      } catch (error) {
        console.error('Failed to create system message for invite acceptance:', error);
      }
    }

    await prisma.invite.delete({
      where: { id: inviteId },
    });

    return { message: 'invites.acceptedSuccessfully' };
  }

  static async declineInvite(inviteId: string) {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        receiver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!invite) {
      throw new ApiError(404, 'Invite not found');
    }

    if (invite.status !== 'PENDING') {
      throw new ApiError(400, 'Invite has already been processed');
    }

    if (invite.gameId && invite.receiver) {
      const receiverName = getUserDisplayName(invite.receiver.firstName, invite.receiver.lastName);
      
      try {
        await createSystemMessage(invite.gameId, {
          type: SystemMessageType.USER_DECLINED_INVITE,
          variables: { userName: receiverName }
        });
      } catch (error) {
        console.error('Failed to create system message for invite decline:', error);
      }
    }

    await prisma.invite.delete({
      where: { id: inviteId },
    });

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
