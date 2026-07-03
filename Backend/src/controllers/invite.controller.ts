import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { ParticipantRole } from '@prisma/client';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../utils/constants';
import { appendGameLog } from '../services/game/gameLog.service';
import notificationService from '../services/notification.service';
import { InviteService } from '../services/invite.service';
import { hasParentGamePermission, hasRealParticipantStatus } from '../utils/parentGamePermissions';
import { ParticipantService } from '../services/game/participant.service';
import { ParticipantMessageHelper } from '../services/game/participantMessageHelper';
import { GameReadService, participantsToInviteShape } from '../services/game/read.service';
import { projectUserForSportContext } from '../services/user/userSportProfile.service';

export const sendInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { receiverId, gameId, message, expiresAt, asTrainer, inviteUserTeamId } = req.body;

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
        user: { select: USER_SELECT_WITH_SPORT_PROFILES },
        invitedByUser: { select: USER_SELECT_WITH_SPORT_PROFILES },
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
            sport: true,
            court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
            club: { select: { id: true, name: true, avatar: true } },
            participants: {
              include: {
                user: { select: USER_SELECT_WITH_SPORT_PROFILES },
                invitedByUser: { select: USER_SELECT_WITH_SPORT_PROFILES },
              },
            },
          },
        },
      },
    });
    if (existingInvited) {
      const sport = existingInvited.game.sport;
      const inviteShape = {
        id: existingInvited.id,
        receiverId: existingInvited.userId,
        gameId: existingInvited.gameId,
        status: 'PENDING',
        message: existingInvited.inviteMessage,
        expiresAt: existingInvited.inviteExpiresAt,
        createdAt: existingInvited.joinedAt,
        updatedAt: existingInvited.joinedAt,
        receiver: projectUserForSportContext(existingInvited.user, sport),
        sender: projectUserForSportContext(existingInvited.invitedByUser, sport),
        game: {
          ...existingInvited.game,
          participants: existingInvited.game.participants.map((participant) => ({
            ...participant,
            user: projectUserForSportContext(participant.user, sport),
            invitedByUser: projectUserForSportContext(participant.invitedByUser, sport),
          })),
        },
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
    asTrainer === true,
    typeof inviteUserTeamId === 'string' && inviteUserTeamId.length > 0 ? inviteUserTeamId : null
  );

  if (gameId && invite.sender && invite.receiver) {
    await appendGameLog({
      gameId,
      type: 'USER_INVITED',
      actorId: invite.sender.id,
      targetId: invite.receiver.id,
      metadata: {
        inviteId: invite.id,
        asTrainer: asTrainer === true,
      },
    });
  }

  // Emit notification to receiver via Socket.IO
  if ((global as any).socketService) {
    (global as any).socketService.emitNewInvite(receiverId, invite);
  }

  if (gameId) {
    await ParticipantMessageHelper.emitGameUpdate(gameId, req.userId!);
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
  const { message } = req.body ?? {};

  if (message !== undefined && message !== null && typeof message !== 'string') {
    throw new ApiError(400, 'errors.invalidInput');
  }

  let declineMessage: string | undefined;
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (trimmed.length > 10000) {
      throw new ApiError(400, 'errors.invites.declineMessageTooLong');
    }
    declineMessage = trimmed || undefined;
  }

  const result = await InviteService.declineInvite(
    id,
    req.userId!,
    req.user?.isAdmin || false,
    declineMessage
  );

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

export const deleteExpiredInvites = asyncHandler(async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, deleted: 0 });
});

export const getGameInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const game = await GameReadService.getGameById(gameId, req.userId);
  const gameAny = game as any;
  res.json({ success: true, data: participantsToInviteShape(gameAny.participants ?? [], game) });
});

export const cancelInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await InviteService.cancelInvite(id, req.userId!);
  if (!result.success) {
    const statusCode =
      result.message === 'errors.invites.notFound'
        ? 404
        : result.message === 'errors.invites.onlySenderCanCancel'
          ? 403
          : 400;
    throw new ApiError(statusCode, result.message);
  }
  res.json({
    success: true,
    message: result.message,
  });
});
