import { ApiError } from '../../utils/ApiError';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { GameService } from '../game/game.service';
import { createSystemMessage } from '../../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';

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
      if (invite.game.participants.length >= invite.game.maxParticipants) {
        throw new ApiError(400, 'Game is full');
      }

      const existingParticipant = invite.game.participants.find(
        p => p.userId === invite.receiverId
      );

      if (!existingParticipant) {
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

    return { message: 'Invite accepted successfully' };
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

    return { message: 'Invite declined successfully' };
  }
}
