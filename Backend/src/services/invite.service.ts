import prisma from '../config/database';
import { ParticipantRole } from '@prisma/client';
import { createSystemMessage } from '../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { validatePlayerCanJoinGame, validateGameCanAcceptParticipants } from '../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../utils/gameQueries';
import { addOrUpdateParticipant } from '../utils/participantOperations';
import { performPostJoinOperations } from '../utils/postJoinOperations';
import { ParticipantService } from './game/participant.service';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { ApiError } from '../utils/ApiError';

export interface InviteActionResult {
  success: boolean;
  message: string;
  invite?: any;
}

export class InviteService {
  static async deleteInvitesForUserInGame(gameId: string, userId: string): Promise<void> {
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId, userId, status: 'INVITED' },
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
        if (p.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(p.invitedByUserId, p.id, p.gameId || undefined);
        }
      });
    }
  }

  static async acceptInvite(participantId: string, userId: string, forceUpdate: boolean = false, isAdmin: boolean = false): Promise<InviteActionResult> {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: {
        user: { select: USER_SELECT_FIELDS },
        invitedByUser: { select: USER_SELECT_FIELDS },
        game: { include: { participants: true } },
      },
    });
    if (!participant || participant.status !== 'INVITED') {
      return { success: false, message: 'errors.invites.notFound' };
    }
    const isReceiver = participant.userId === userId;
    let hasAdminPermission = false;
    if (!isReceiver && participant.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        participant.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }
    if (!isReceiver && !hasAdminPermission) {
      return { success: false, message: 'errors.invites.notAuthorizedToAccept' };
    }
    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({ where: { id: participantId }, data: { status: 'NON_PLAYING' } });
      if ((global as any).socketService) {
        (global as any).socketService.emitInviteDeleted(participant.userId, participantId, participant.gameId || undefined);
        if (participant.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(participant.invitedByUserId, participantId, participant.gameId || undefined);
        }
      }
      return { success: true, message: 'invites.acceptedSuccessfully' };
    }
    if (participant.inviteExpiresAt && new Date() > participant.inviteExpiresAt) {
      await prisma.gameParticipant.deleteMany({ where: { id: participantId } });
      return { success: false, message: 'errors.invites.expired' };
    }
    const gameId = participant.gameId;
    const receiverId = participant.userId;
    if (gameId && participant.game) {
      try {
        await prisma.$transaction(async (tx: any) => {
          const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
          validateGameCanAcceptParticipants(currentGame);
          const existingParticipant = await tx.gameParticipant.findFirst({
            where: { gameId, userId: receiverId },
          });
          if (existingParticipant?.status === 'PLAYING') return;
          const joinResult = await validatePlayerCanJoinGame(currentGame, receiverId);
          if (!joinResult.canJoin && joinResult.shouldQueue) {
            throw new ApiError(400, joinResult.reason || 'errors.invites.gameFull');
          }
          await tx.gameParticipant.delete({ where: { id: participantId } });
          const isTrainerInvite = participant.role === ParticipantRole.ADMIN && participant.game?.entityType === 'TRAINING';
          if (isTrainerInvite) {
            await tx.game.update({ where: { id: gameId }, data: { trainerId: receiverId } });
          }
          await addOrUpdateParticipant(tx, gameId, receiverId, {
            role: participant.role as ParticipantRole,
            status: isTrainerInvite ? 'NON_PLAYING' : undefined,
          });
        });
        await performPostJoinOperations(gameId, receiverId);
      } catch (error: any) {
        if (error.message === 'errors.invites.gameFull' && gameId) {
          await ParticipantService.addToQueueAsParticipant(gameId, receiverId);
          await prisma.gameParticipant.deleteMany({ where: { id: participantId } });
          return { success: true, message: 'games.addedToJoinQueue' };
        }
        throw error;
      }
    } else {
      await prisma.gameParticipant.deleteMany({ where: { id: participantId } });
    }
    if ((global as any).socketService) {
      (global as any).socketService.emitInviteDeleted(receiverId, participantId, gameId || undefined);
      if (participant.invitedByUserId) {
        (global as any).socketService.emitInviteDeleted(participant.invitedByUserId, participantId, gameId || undefined);
      }
      if (gameId) {
        (global as any).socketService.emitGameUpdate(gameId, receiverId, undefined, forceUpdate);
      }
    }
    return { success: true, message: 'invites.acceptedSuccessfully' };
  }

  static async declineInvite(participantId: string, userId: string, isAdmin: boolean = false): Promise<InviteActionResult> {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: { user: { select: USER_SELECT_FIELDS } },
    });
    if (!participant || participant.status !== 'INVITED') {
      return { success: false, message: 'errors.invites.notFound' };
    }
    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({ where: { id: participantId }, data: { status: 'NON_PLAYING' } });
      if ((global as any).socketService) {
        (global as any).socketService.emitInviteDeleted(participant.userId, participantId, participant.gameId || undefined);
        if (participant.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(participant.invitedByUserId, participantId, participant.gameId || undefined);
        }
      }
      return { success: true, message: 'invites.declinedSuccessfully' };
    }
    const isReceiver = participant.userId === userId;
    let hasAdminPermission = false;
    if (!isReceiver && participant.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        participant.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }
    if (!isReceiver && !hasAdminPermission) {
      return { success: false, message: 'errors.invites.notAuthorizedToDecline' };
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
    if ((global as any).socketService) {
      (global as any).socketService.emitInviteDeleted(participant.userId, participantId, participant.gameId || undefined);
      if (participant.invitedByUserId) {
        (global as any).socketService.emitInviteDeleted(participant.invitedByUserId, participantId, participant.gameId || undefined);
      }
    }
    await prisma.gameParticipant.deleteMany({ where: { id: participantId } });
    return { success: true, message: 'invites.declinedSuccessfully' };
  }
}
