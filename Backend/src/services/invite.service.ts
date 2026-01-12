import prisma from '../config/database';
import { InviteStatus, ParticipantRole } from '@prisma/client';
import { createSystemMessage } from '../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { GameService } from './game/game.service';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { canAddPlayerToGame, validateGenderForGame } from '../utils/participantValidation';
import { JoinQueueService } from './game/joinQueue.service';
import { USER_SELECT_FIELDS } from '../utils/constants';

export interface InviteActionResult {
  success: boolean;
  message: string;
  invite?: any;
}

export class InviteService {
  static async deleteInvitesForUserInGame(gameId: string, userId: string): Promise<void> {
    const invites = await prisma.invite.findMany({
      where: {
        gameId,
        receiverId: userId,
        status: InviteStatus.PENDING,
      },
      select: {
        id: true,
        receiverId: true,
        senderId: true,
        gameId: true,
      },
    });

    if (invites.length === 0) {
      return;
    }

    const inviteIds = invites.map(invite => invite.id);

    await prisma.invite.deleteMany({
      where: {
        id: { in: inviteIds },
      },
    });

    if ((global as any).socketService) {
      invites.forEach(invite => {
        (global as any).socketService.emitInviteDeleted(invite.receiverId, invite.id, invite.gameId || undefined);
        if (invite.senderId) {
          (global as any).socketService.emitInviteDeleted(invite.senderId, invite.id, invite.gameId || undefined);
        }
      });
    }
  }

  static async acceptInvite(inviteId: string, userId: string, forceUpdate: boolean = false, isAdmin: boolean = false): Promise<InviteActionResult> {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        sender: {
          select: USER_SELECT_FIELDS,
        },
        receiver: {
          select: USER_SELECT_FIELDS,
        },
        game: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!invite) {
      return {
        success: false,
        message: 'errors.invites.notFound',
      };
    }

    // Check if user is the receiver or has admin/owner permissions on the game
    const isReceiver = invite.receiverId === userId;
    let hasAdminPermission = false;
    
    if (!isReceiver && invite.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        invite.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }

    if (!isReceiver && !hasAdminPermission) {
      return {
        success: false,
        message: 'errors.invites.notAuthorizedToAccept',
      };
    }

    if (invite.status !== InviteStatus.PENDING) {
      return {
        success: false,
        message: 'errors.invites.alreadyProcessed',
      };
    }

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      await prisma.invite.delete({
        where: { id: inviteId },
      });
      return {
        success: false,
        message: 'errors.invites.expired',
      };
    }

    if (invite.gameId && invite.game) {
      await validateGenderForGame(invite.game, invite.receiverId);

      // Always add the receiver (not the person accepting) as participant
      const existingParticipant = invite.game.participants.find(
        (p: any) => p.userId === invite.receiverId
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
            return {
              success: true,
              message: 'games.addedToJoinQueue',
            };
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
          return {
            success: true,
            message: 'games.addedToJoinQueue',
          };
        }

        await prisma.gameParticipant.create({
          data: {
            gameId: invite.gameId,
            userId: invite.receiverId,
            role: ParticipantRole.PARTICIPANT,
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

    if ((global as any).socketService) {
      (global as any).socketService.emitInviteDeleted(invite.receiverId, invite.id, invite.gameId || undefined);
      if (invite.senderId) {
        (global as any).socketService.emitInviteDeleted(invite.senderId, invite.id, invite.gameId || undefined);
      }
      if (invite.gameId) {
        // Emit game update for the receiver (the person joining), not the person accepting
        (global as any).socketService.emitGameUpdate(invite.gameId, invite.receiverId, undefined, forceUpdate);
      }
    }

    await prisma.invite.delete({
      where: { id: inviteId },
    });

    return {
      success: true,
      message: 'Invite accepted successfully',
    };
  }

  static async declineInvite(inviteId: string, userId: string, isAdmin: boolean = false): Promise<InviteActionResult> {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        receiver: {
          select: USER_SELECT_FIELDS,
        },
      },
    });

    if (!invite) {
      return {
        success: false,
        message: 'errors.invites.notFound',
      };
    }

    // Check if user is the receiver or has admin/owner permissions on the game
    const isReceiver = invite.receiverId === userId;
    let hasAdminPermission = false;
    
    if (!isReceiver && invite.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        invite.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }

    if (!isReceiver && !hasAdminPermission) {
      return {
        success: false,
        message: 'errors.invites.notAuthorizedToDecline',
      };
    }

    if (invite.status !== InviteStatus.PENDING) {
      return {
        success: false,
        message: 'errors.invites.alreadyProcessed',
      };
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

    if ((global as any).socketService) {
      (global as any).socketService.emitInviteDeleted(invite.receiverId, invite.id, invite.gameId || undefined);
      if (invite.senderId) {
        (global as any).socketService.emitInviteDeleted(invite.senderId, invite.id, invite.gameId || undefined);
      }
    }

    await prisma.invite.delete({
      where: { id: inviteId },
    });

    return {
      success: true,
      message: 'Invite declined successfully',
    };
  }
}
