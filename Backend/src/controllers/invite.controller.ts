import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { InviteStatus, ParticipantRole } from '@prisma/client';
import { createSystemMessage } from './chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';

export const sendInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { receiverId, gameId, message, expiresAt } = req.body;

  if (!gameId) {
    throw new ApiError(400, 'Must specify gameId');
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
  });

  if (!receiver) {
    throw new ApiError(404, 'Receiver not found');
  }

  if (gameId) {
    const participant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: req.userId,
      },
    });

    if (!participant) {
      throw new ApiError(403, 'Only participants can send invites');
    }

    const existingInvite = await prisma.invite.findFirst({
      where: {
        gameId,
        receiverId,
        status: InviteStatus.PENDING,
      },
    });

    if (existingInvite) {
      throw new ApiError(400, 'Invite already sent to this user');
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
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        },
      },
      game: {
        select: {
          id: true,
          name: true,
          startTime: true,
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
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        },
      },
      // Include court and club relations
      game: {
        include: {
          court: true,
          club: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: invites,
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
    throw new ApiError(404, 'Invite not found');
  }

  if (invite.receiverId !== req.userId) {
    throw new ApiError(403, 'Not authorized to accept this invite');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'Invite has already been processed');
  }

  if (invite.expiresAt && new Date() > invite.expiresAt) {
    await prisma.invite.update({
      where: { id },
      data: { status: InviteStatus.DECLINED },
    });
    throw new ApiError(400, 'Invite has expired');
  }

  if (invite.gameId && invite.game) {
    if (invite.game.participants.length >= invite.game.maxParticipants) {
      throw new ApiError(400, 'Game is full');
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
    throw new ApiError(404, 'Invite not found');
  }

  if (invite.receiverId !== req.userId) {
    throw new ApiError(403, 'Not authorized to decline this invite');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'Invite has already been processed');
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
    throw new ApiError(404, 'Game not found');
  }

  const isParticipant = game.participants.some((p: any) => p.userId === req.userId);
  if (!isParticipant) {
    throw new ApiError(403, 'Only participants can view game invites');
  }

  const invites = await prisma.invite.findMany({
    where: {
      gameId,
      status: InviteStatus.PENDING,
    },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          level: true,
          gender: true,
        },
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
    throw new ApiError(404, 'Invite not found');
  }

  if (invite.senderId !== req.userId) {
    throw new ApiError(403, 'Only the sender can cancel this invite');
  }

  if (invite.status !== InviteStatus.PENDING) {
    throw new ApiError(400, 'Can only cancel pending invites');
  }

  await prisma.invite.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: 'Invite cancelled successfully',
  });
});

