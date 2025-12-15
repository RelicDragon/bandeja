import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';
import { formatDuration } from '../../telegram/utils';

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

  const senderName = invite.sender 
    ? `${invite.sender.firstName || ''} ${invite.sender.lastName || ''}`.trim() || 'Unknown'
    : 'Unknown';

  const lang = receiver.language || 'en';

  if (!invite.game) {
    return null;
  }

  const game = invite.game;
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const timezone = await getUserTimezoneFromCityId(receiver.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);

  const title = t('telegram.inviteReceived', lang);
  const body = `${senderName} ${t('telegram.invitedYou', lang)}\n${place} ${shortDate} ${startTime}, ${duration}`;

  return {
    type: NotificationType.INVITE,
    title,
    body,
    data: {
      gameId: game.id,
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
