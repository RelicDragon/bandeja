import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';

export async function createInvitePushNotification(
  invite: any
): Promise<NotificationPayload | null> {
  const receiver = await prisma.user.findUnique({
    where: { id: invite.receiverId },
    select: {
      id: true,
      language: true,
      currentCityId: true,
      sendPushInvites: true,
    }
  });

  if (!receiver || !receiver.sendPushInvites) {
    return null;
  }

  if (!invite.game) {
    return null;
  }

  const lang = receiver.language || 'en';
  const senderName = invite.sender ? formatUserName(invite.sender) : 'Unknown';
  const gameInfo = await formatGameInfoForUser(invite.game, receiver.currentCityId, lang);

  const title = t('telegram.inviteReceived', lang);
  const body = `${senderName} ${t('telegram.invitedYou', lang)}\n${gameInfo.place} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.INVITE,
    title,
    body,
    data: {
      gameId: invite.game.id,
      inviteId: invite.id
    },
    actions: [
      {
        id: 'accept',
        title: t('telegram.acceptInvite', lang),
        action: 'accept'
      },
      {
        id: 'decline',
        title: t('telegram.declineInvite', lang),
        action: 'decline'
      }
    ],
    sound: 'default'
  };
}
