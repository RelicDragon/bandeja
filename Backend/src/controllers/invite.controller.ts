import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { ParticipantRole } from '@prisma/client';
import { createSystemMessage } from './chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { USER_SELECT_FIELDS } from '../utils/constants';
import notificationService from '../services/notification.service';
import { InviteService } from '../services/invite.service';
import { hasParentGamePermission, hasRealParticipantStatus } from '../utils/parentGamePermissions';
import { ParticipantService } from '../services/game/participant.service';
import { GameReadService, participantsToInviteShape } from '../services/game/read.service';

export const sendInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { receiverId, gameId, message, expiresAt, asTrainer } = req.body;

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
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { anyoneCanInvite: true },
    });

    if (!game) {
      throw new ApiError(404, 'errors.invites.gameNotFound');
    }

    const isAdminOrOwner = await hasParentGamePermission(
      gameId,
      req.userId!,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN],
      req.user?.isAdmin || false
    );

    const hasRealStatus = await hasRealParticipantStatus(gameId, req.userId!);

    if (!hasRealStatus) {
      throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
    }

    if (!isAdminOrOwner) {
      if (!game.anyoneCanInvite) {
        throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
      }

      const isParticipant = await hasParentGamePermission(
        gameId,
        req.userId!,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT],
        req.user?.isAdmin || false
      );

      if (!isParticipant) {
        throw new ApiError(403, 'errors.invites.onlyParticipantsCanSend');
      }
    }

    const existingInvited = await prisma.gameParticipant.findFirst({
      where: { gameId, userId: receiverId, status: 'INVITED' },
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
    if (existingInvited) {
      const inviteShape = {
        id: existingInvited.id,
        receiverId: existingInvited.userId,
        gameId: existingInvited.gameId,
        status: 'PENDING',
        message: existingInvited.inviteMessage,
        expiresAt: existingInvited.inviteExpiresAt,
        createdAt: existingInvited.joinedAt,
        updatedAt: existingInvited.joinedAt,
        receiver: existingInvited.user,
        sender: existingInvited.invitedByUser,
        game: existingInvited.game,
      };
      return res.status(200).json({ success: true, data: inviteShape });
    }

    const existingParticipant = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: receiverId,
        status: 'PLAYING',
      },
    });

    const existingQueue = await prisma.gameParticipant.findFirst({
      where: {
        gameId,
        userId: receiverId,
        status: 'IN_QUEUE',
        role: 'PARTICIPANT',
      },
    });

    if (existingParticipant) {
      return res.status(200).json({
        success: true,
        message: 'User is already a participant',
      });
    }

    if (existingQueue) {
      try {
        await ParticipantService.acceptNonPlayingParticipant(gameId, req.userId!, receiverId);
        return res.status(200).json({
          success: true,
          message: 'User was automatically accepted from queue',
        });
      } catch (error: any) {
        if (error.statusCode === 403) {
          throw new ApiError(403, 'errors.invites.notAuthorizedToAcceptQueue');
        }
        throw error;
      }
    }
  }

  const { invite } = await ParticipantService.sendInvite(
    gameId,
    req.userId!,
    receiverId,
    message,
    expiresAt ? new Date(expiresAt) : null,
    asTrainer === true
  );

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

  // Send notification if enabled
  if (invite.game) {
    notificationService.sendInviteNotification(invite).catch(error => {
      console.error('Failed to send invite notification:', error);
    });
  }

  res.status(201).json({
    success: true,
    data: invite,
  });
});

export const getMyInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await InviteService.getMyPendingInvites(req.userId!);
  res.json({ success: true, data });
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await InviteService.acceptInvite(id, req.userId!, req.user?.isAdmin || false);

  if (!result.success) {
    const statusCode = result.message === 'errors.invites.notFound' ? 404 :
                      result.message === 'errors.invites.notAuthorizedToAccept' ? 403 : 400;
    throw new ApiError(statusCode, result.message);
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const declineInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await InviteService.declineInvite(id, req.userId!, req.user?.isAdmin || false);

  if (!result.success) {
    const statusCode = result.message === 'errors.invites.notFound' ? 404 :
                      result.message === 'errors.invites.notAuthorizedToDecline' ? 403 :
                      result.message === 'errors.invites.ownerCannotDecline' ? 400 : 400;
    throw new ApiError(statusCode, result.message);
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const deleteExpiredInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const participants = await prisma.gameParticipant.findMany({
    where: {
      status: 'INVITED',
      OR: [
        { inviteExpiresAt: { lt: new Date() } },
        { game: { startTime: { lt: new Date() } } },
      ],
    },
    select: { id: true, role: true },
  });
  const ownerIds = participants.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
  const toDelete = participants.filter((p) => p.role !== ParticipantRole.OWNER).map((p) => p.id);
  if (ownerIds.length > 0) {
    await prisma.gameParticipant.updateMany({ where: { id: { in: ownerIds } }, data: { status: 'NON_PLAYING' } });
  }
  let deleted = 0;
  if (toDelete.length > 0) {
    const result = await prisma.gameParticipant.deleteMany({ where: { id: { in: toDelete } } });
    deleted = result.count;
  }
  res.json({ success: true, message: `Deleted ${deleted} expired invites` });
});

export const getGameInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const game = await GameReadService.getGameById(gameId, req.userId);
  const gameAny = game as any;
  res.json({ success: true, data: participantsToInviteShape(gameAny.participants ?? [], game) });
});

export const cancelInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const participant = await prisma.gameParticipant.findUnique({
    where: { id },
    select: { id: true, status: true, role: true, invitedByUserId: true, userId: true, gameId: true },
  });
  if (!participant || participant.status !== 'INVITED') {
    throw new ApiError(404, 'errors.invites.notFound');
  }
  if (participant.invitedByUserId !== req.userId) {
    throw new ApiError(403, 'errors.invites.onlySenderCanCancel');
  }
  if (participant.role === ParticipantRole.OWNER) {
    await prisma.gameParticipant.update({ where: { id }, data: { status: 'NON_PLAYING' } });
  } else {
    await prisma.gameParticipant.delete({ where: { id } });
  }
  if ((global as any).socketService) {
    (global as any).socketService.emitInviteDeleted(participant.userId, id, participant.gameId || undefined);
    if (participant.invitedByUserId) {
      (global as any).socketService.emitInviteDeleted(participant.invitedByUserId, id, participant.gameId || undefined);
    }
  }
  res.json({ success: true, message: 'Invite cancelled successfully' });
});

export const deleteInvitesForStartedGame = async (gameId: string) => {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });
  if (!game || game.status !== 'STARTED') return;
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId, status: 'INVITED' },
    select: { id: true, role: true, userId: true, invitedByUserId: true, gameId: true },
  });
  if (participants.length === 0) return;
  const ownerIds = participants.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
  const toDelete = participants.filter((p) => p.role !== ParticipantRole.OWNER).map((p) => p.id);
  if (ownerIds.length > 0) {
    await prisma.gameParticipant.updateMany({ where: { id: { in: ownerIds } }, data: { status: 'NON_PLAYING' } });
  }
  if (toDelete.length > 0) {
    await prisma.gameParticipant.deleteMany({ where: { id: { in: toDelete } } });
  }
  if ((global as any).socketService) {
    participants.forEach((p) => {
      (global as any).socketService.emitInviteDeleted(p.userId, p.id, p.gameId || undefined);
      if (p.invitedByUserId) (global as any).socketService.emitInviteDeleted(p.invitedByUserId, p.id, p.gameId || undefined);
    });
  }
};

export const deleteInvitesForArchivedGame = async (gameId: string) => {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });
  if (!game || game.status !== 'ARCHIVED') return;
  const participants = await prisma.gameParticipant.findMany({
    where: { gameId, status: 'INVITED' },
    select: { id: true, role: true, userId: true, invitedByUserId: true, gameId: true },
  });
  if (participants.length === 0) return;
  const ownerIds = participants.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
  const toDelete = participants.filter((p) => p.role !== ParticipantRole.OWNER).map((p) => p.id);
  if (ownerIds.length > 0) {
    await prisma.gameParticipant.updateMany({ where: { id: { in: ownerIds } }, data: { status: 'NON_PLAYING' } });
  }
  if (toDelete.length > 0) {
    await prisma.gameParticipant.deleteMany({ where: { id: { in: toDelete } } });
  }
  if ((global as any).socketService) {
    participants.forEach((p) => {
      (global as any).socketService.emitInviteDeleted(p.userId, p.id, p.gameId || undefined);
      if (p.invitedByUserId) (global as any).socketService.emitInviteDeleted(p.invitedByUserId, p.id, p.gameId || undefined);
    });
  }
};

