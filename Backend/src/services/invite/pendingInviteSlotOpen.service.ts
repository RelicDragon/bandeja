import { NotificationChannelType, ParticipantStatus } from '@prisma/client';
import prisma from '../../config/database';
import { countPlayingParticipants, pendingInvitesForSlotOpenNotify } from '../../utils/gameInviteInbox';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import notificationService from '../notification.service';
import { createInvitePushNotification } from '../push/notifications/invite-push.notification';
import { NotificationType } from '../../types/notifications.types';
import { mapInvitedParticipantToInboxInvite } from './pendingInviteShape';
import {
  deliverSlotOpenInviteNotifications,
  type SlotOpenInviteNotifier,
} from './pendingInviteSlotOpenNotify';

export function createSlotOpenInviteNotifier(): SlotOpenInviteNotifier {
  return {
    sendPush: async (invite) => {
      const payload = await createInvitePushNotification(invite);
      if (!payload) return;
      await notificationService.sendNotification({
        userId: invite.receiverId,
        type: NotificationType.INVITE,
        payload,
        channels: [NotificationChannelType.PUSH],
      });
    },
    emitNewInvite: (receiverId, invite) => {
      const socketService = (global as { socketService?: { emitNewInvite: (a: string, b: unknown) => void } })
        .socketService;
      socketService?.emitNewInvite(receiverId, invite);
    },
  };
}

export async function notifyPendingInvitesIfPlayingSlotOpened(
  gameId: string,
  playingRemovedCount = 1,
  notifier: SlotOpenInviteNotifier = createSlotOpenInviteNotifier(),
): Promise<number> {
  if (playingRemovedCount <= 0) return 0;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
      club: { select: { id: true, name: true, avatar: true } },
      participants: {
        include: {
          user: { select: USER_SELECT_WITH_SPORT_PROFILES },
          invitedByUser: { select: USER_SELECT_WITH_SPORT_PROFILES },
        },
      },
    },
  });
  if (!game) return 0;

  const pending = game.participants.filter((participant) => participant.status === ParticipantStatus.INVITED);
  const toNotify = pendingInvitesForSlotOpenNotify({
    entityType: game.entityType,
    maxParticipants: game.maxParticipants,
    playingCountAfter: countPlayingParticipants(game.participants),
    playingRemovedCount,
    pending: pending.map((participant) => ({
      ...participant,
      game,
    })),
  });

  return deliverSlotOpenInviteNotifications(
    toNotify.map((participant) => mapInvitedParticipantToInboxInvite(participant)),
    notifier,
  );
}

export function schedulePendingInviteSlotOpenNotify(gameId: string, playingRemovedCount = 1): void {
  void notifyPendingInvitesIfPlayingSlotOpened(gameId, playingRemovedCount).catch((error) => {
    console.error('Pending invite slot-open notify failed:', error);
  });
}
