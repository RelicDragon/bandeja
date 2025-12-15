import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function createGameChatPushNotification(
  message: any,
  game: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Unknown';
  const messageContent = message.content || '[Media]';
  const lang = recipient.language || 'en';

  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const timezone = await getUserTimezoneFromCityId(recipient.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);

  const title = `${place} ${shortDate} ${startTime}`;
  const body = `${senderName}: ${messageContent}`;

  return {
    type: NotificationType.GAME_CHAT,
    title,
    body,
    data: {
      gameId: game.id,
      messageId: message.id,
      chatType: message.chatType
    },
    sound: 'default'
  };
}
