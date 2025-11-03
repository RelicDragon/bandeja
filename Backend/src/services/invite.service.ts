import prisma from '../config/database';
import { InviteStatus, ParticipantRole } from '@prisma/client';
import { createSystemMessage } from '../controllers/chat.controller';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';

export interface InviteActionResult {
  success: boolean;
  message: string;
  invite?: any;
}

export class InviteService {
  static async acceptInvite(inviteId: string, userId: string, forceUpdate: boolean = false): Promise<InviteActionResult> {
    const invite = await prisma.invite.findUnique({
      where: { id: inviteId },
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
      return {
        success: false,
        message: 'errors.invites.notFound',
      };
    }

    if (invite.receiverId !== userId) {
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
      await prisma.invite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.DECLINED },
      });
      return {
        success: false,
        message: 'errors.invites.expired',
      };
    }

    if (invite.gameId && invite.game) {
      if (invite.game.participants.length >= invite.game.maxParticipants) {
        return {
          success: false,
          message: 'errors.invites.gameFull',
        };
      }

      const existingParticipant = invite.game.participants.find(
        (p: any) => p.userId === userId
      );

      if (!existingParticipant) {
        await prisma.gameParticipant.create({
          data: {
            gameId: invite.gameId,
            userId: userId,
            role: ParticipantRole.PARTICIPANT,
          },
        });
      }
    }

    const updatedInvite = await prisma.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.ACCEPTED },
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
      (global as any).socketService.emitInviteDeleted(updatedInvite.receiverId, updatedInvite.id, updatedInvite.gameId || undefined);
      if (updatedInvite.senderId) {
        (global as any).socketService.emitInviteDeleted(updatedInvite.senderId, updatedInvite.id, updatedInvite.gameId || undefined);
      }
      if (updatedInvite.gameId) {
        (global as any).socketService.emitGameUpdate(updatedInvite.gameId, userId, undefined, forceUpdate);
      }
    }

    return {
      success: true,
      message: 'Invite accepted successfully',
      invite: updatedInvite,
    };
  }

  static async declineInvite(inviteId: string, userId: string): Promise<InviteActionResult> {
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
      return {
        success: false,
        message: 'errors.invites.notFound',
      };
    }

    if (invite.receiverId !== userId) {
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

    const updatedInvite = await prisma.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.DECLINED },
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
      (global as any).socketService.emitInviteDeleted(updatedInvite.receiverId, updatedInvite.id, updatedInvite.gameId || undefined);
      if (updatedInvite.senderId) {
        (global as any).socketService.emitInviteDeleted(updatedInvite.senderId, updatedInvite.id, updatedInvite.gameId || undefined);
      }
    }

    return {
      success: true,
      message: 'Invite declined successfully',
      invite: updatedInvite,
    };
  }
}
