import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { InviteStatus, ParticipantRole } from '@prisma/client';
import { createSystemMessage } from './chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { USER_SELECT_FIELDS } from '../utils/constants';

export const sendInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { receiverId, gameId, message, expiresAt } = req.body;

  if (!gameId) {
    throw new ApiError(400, 'errors.invites.mustSpecifyGameId');
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
  });

  if (!receiver) {
    throw new ApiError(404, 'errors.invites.receiverNotFound');
  }

  if (gameId) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: req.userId,
      },
    });

    if (!participant) {
      throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
    }

    const existingInvite = await prisma.invite.findFirst({
      where: {
        gameId,
        receiverId,
        status: InviteStatus.PENDING,
      },
    });

    if (existingInvite) {
      throw new ApiError(400, 'errors.invites.alreadySent');
    }
  }

  const invite = await prisma.invite.create({
    data: {
      senderId: req.userId!,
      receiverId,
      gameId,
      message,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    include: {
      sender: {
        select: USER_SELECT_FIELDS,
      },
      receiver: {
        select: USER_SELECT_FIELDS,
      },
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
          hasResults: true,
          entityType: true,
          court: {
            select: {
              id: true,
              name: true,
              club: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          club: {
            select: {
              id: true,
              name: true,
            },
          },
          participants: {
            select: {
              userId: true,
              isPlaying: true,
              role: true,
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
      },
    },
  });

  // Send system message to game chat if it's a game invite
  if (gameId && invite.sender && invite.receiver) {
    const senderName = getUserDisplayName(invite.sender.firstName, invite.sender.lastName);
    const receiverName = getUserDisplayName(invite.receiver.firstName, invite.receiver.lastName);
    
    try {
      await createSystemMessage(gameId, {
        type: SystemMessageType.USER_INVITES_USER,
        variables: { senderName, receiverName }
      });
    } catch (error) {
      console.error('Failed to create system message for invite:', error);
      // Don't fail the invite creation if system message fails
    }
  }

  // Emit notification to receiver via Socket.IO
  if ((global as any).socketService) {
    (global as any).socketService.emitNewInvite(receiverId, invite);
  }

  res.status(201).json({
    success: true,
    data: invite,
  });
});

export const getMyInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;

  const where: any = {
    receiverId: req.userId,
  };

  if (status) {
    where.status = status;
  }

  const invites = await prisma.invite.findMany({
    where,
    include: {
      sender: {
        select: USER_SELECT_FIELDS,
      },
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
          hasResults: true,
          entityType: true,
          court: {
            select: {
              id: true,
              name: true,
              club: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          club: {
            select: {
              id: true,
              name: true,
            },
          },
          participants: {
            select: {
              userId: true,
              isPlaying: true,
              role: true,
              user: {
                select: USER_SELECT_FIELDS,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const invitesToDelete: string[] = [];

  invites.forEach(invite => {
    if (invite.game && invite.status === InviteStatus.PENDING) {
      const isGameStarted = new Date(invite.game.startTime) <= now && new Date(invite.game.endTime) > now;
      if (isGameStarted) {
        invitesToDelete.push(invite.id);
      }
    }
  });

  if (invitesToDelete.length > 0) {
    await prisma.invite.deleteMany({
      where: {
        id: { in: invitesToDelete },
      },
    });

    if ((global as any).socketService) {
      const invitesToNotify = invites.filter(inv => invitesToDelete.includes(inv.id));
      invitesToNotify.forEach(invite => {
        (global as any).socketService.emitInviteDeleted(invite.receiverId, invite.id, invite.gameId || undefined);
      });
    }
  }

  const filteredInvites = invites.filter(invite => !invitesToDelete.includes(invite.id));

  res.json({
    success: true,
    data: filteredInvites,
  });
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const invite = await prisma.invite.findUnique({
    where: { id },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
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
    throw new ApiError(404, 'errors.invites.notFound');
  }

  if (invite.receiverId !== req.userId) {
    throw new ApiError(403, 'errors.invites.notAuthorizedToAccept');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'errors.invites.alreadyProcessed');
  }

  if (invite.expiresAt && new Date() > invite.expiresAt) {
    await prisma.invite.update({
      where: { id },
      data: { status: InviteStatus.DECLINED },
    });
    throw new ApiError(400, 'errors.invites.expired');
  }

  if (invite.gameId && invite.game) {
    if (invite.game.participants.length >= invite.game.maxParticipants) {
      throw new ApiError(400, 'errors.invites.gameFull');
    }

    const existingParticipant = invite.game.participants.find(
      (p: any) => p.userId === req.userId
    );

    if (!existingParticipant) {
      await prisma.gameParticipant.create({
        data: {
          gameId: invite.gameId,
          userId: req.userId!,
          role: ParticipantRole.PARTICIPANT,
        },
      });
    }
  }

  await prisma.invite.update({
    where: { id },
    data: { status: InviteStatus.ACCEPTED },
  });

  // Send system message to game chat if it's a game invite
  if (invite.gameId && invite.receiver) {
    const receiverName = getUserDisplayName(invite.receiver.firstName, invite.receiver.lastName);
    
    try {
      await createSystemMessage(invite.gameId, {
        type: SystemMessageType.USER_ACCEPTED_INVITE,
        variables: { userName: receiverName }
      });
    } catch (error) {
      console.error('Failed to create system message for invite acceptance:', error);
      // Don't fail the invite acceptance if system message fails
    }
  }

  res.json({
    success: true,
    message: 'Invite accepted successfully',
  });
});

export const declineInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const invite = await prisma.invite.findUnique({
    where: { id },
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
    throw new ApiError(404, 'errors.invites.notFound');
  }

  if (invite.receiverId !== req.userId) {
    throw new ApiError(403, 'errors.invites.notAuthorizedToDecline');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'errors.invites.alreadyProcessed');
  }

  await prisma.invite.update({
    where: { id },
    data: { status: InviteStatus.DECLINED },
  });

  // Send system message to game chat if it's a game invite
  if (invite.gameId && invite.receiver) {
    const receiverName = getUserDisplayName(invite.receiver.firstName, invite.receiver.lastName);
    
    try {
      await createSystemMessage(invite.gameId, {
        type: SystemMessageType.USER_DECLINED_INVITE,
        variables: { userName: receiverName }
      });
    } catch (error) {
      console.error('Failed to create system message for invite decline:', error);
      // Don't fail the invite decline if system message fails
    }
  }

  res.json({
    success: true,
    message: 'Invite declined successfully',
  });
});

export const deleteExpiredInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await prisma.invite.deleteMany({
    where: {
      OR: [
        {
          expiresAt: {
            lt: new Date(),
          },
        },
        {
          game: {
            startTime: {
              lt: new Date(),
            },
          },
        },
      ],
    },
  });

  res.json({
    success: true,
    message: `Deleted ${result.count} expired invites`,
  });
});

export const getGameInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
    },
  });

  if (!game) {
    throw new ApiError(404, 'errors.invites.gameNotFound');
  }

  const isParticipant = game.participants.some((p: any) => p.userId === req.userId);
  if (!isParticipant) {
    throw new ApiError(403, 'errors.invites.onlyParticipantsCanView');
  }

  const invites = await prisma.invite.findMany({
    where: {
      gameId,
      status: InviteStatus.PENDING,
    },
    include: {
      sender: {
        select: USER_SELECT_FIELDS,
      },
        receiver: {
          select: USER_SELECT_FIELDS,
        },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: invites,
  });
});

export const cancelInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const invite = await prisma.invite.findUnique({
    where: { id },
  });

  if (!invite) {
    throw new ApiError(404, 'errors.invites.notFound');
  }

  if (invite.senderId !== req.userId) {
    throw new ApiError(403, 'errors.invites.onlySenderCanCancel');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'errors.invites.canOnlyCancelPending');
  }

  await prisma.invite.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: 'Invite cancelled successfully',
  });
});

export const deleteInvitesForStartedGame = async (gameId: string) => {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      status: true,
      invites: {
        where: {
          status: InviteStatus.PENDING,
        },
        select: {
          id: true,
          receiverId: true,
          gameId: true,
        },
      },
    },
  });

  if (!game || game.status !== 'STARTED') {
    return;
  }

  if (game.invites.length === 0) {
    return;
  }

  const inviteIds = game.invites.map(invite => invite.id);
  const receiverIds = Array.from(new Set(game.invites.map(invite => invite.receiverId)));

  await prisma.invite.deleteMany({
    where: {
      id: { in: inviteIds },
      status: InviteStatus.PENDING,
    },
  });

  if ((global as any).socketService) {
    receiverIds.forEach(receiverId => {
      game.invites
        .filter(invite => invite.receiverId === receiverId)
        .forEach(invite => {
          (global as any).socketService.emitInviteDeleted(receiverId, invite.id, invite.gameId || undefined);
        });
    });
  }
};

