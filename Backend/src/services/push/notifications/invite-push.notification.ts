import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

export async function createInvitePushNotification(
  invite: any
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(invite.receiverId, NotificationChannelType.PUSH, PreferenceKey.SEND_INVITES);
  if (!allowed) return null;

  const receiver = await prisma.user.findUnique({
    where: { id: invite.receiverId },
    select: {
      id: true,
      language: true,
      currentCityId: true,
    }
  });

  if (!receiver) return null;

  if (!invite.game) {
    return null;
  }

  const lang = receiver.language || 'en';
  const senderName = invite.sender ? formatUserName(invite.sender) : 'Unknown';
  const gameInfo = await formatGameInfoForUser(invite.game, receiver.currentCityId, lang);

  const title = t('telegram.inviteReceived', lang);
  const body = `${senderName} ${t('telegram.invitedYou', lang)}\n${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.INVITE,
    title,
    body,
    data: {
      gameId: invite.game.id,
      inviteId: invite.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek
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
