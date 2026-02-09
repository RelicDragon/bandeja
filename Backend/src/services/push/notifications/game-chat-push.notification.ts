import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatGameInfoForUser, formatUserName, getEntityTypeLabel } from '../../shared/notification-base';

export async function createGameChatPushNotification(
  message: any,
  game: any,
  sender: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient.language || 'en';
  const senderName = formatUserName(sender);
  const messageContent = message.content || '[Media]';
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const entityLabel = getEntityTypeLabel(game.entityType, lang);

  const baseTitle = `${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`;
  const title = entityLabel ? `${entityLabel}: ${baseTitle}` : baseTitle;
  const body = `${senderName}: ${messageContent}`;

  return {
    type: NotificationType.GAME_CHAT,
    title,
    body,
    data: {
      gameId: game.id,
      messageId: message.id,
      chatType: message.chatType,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}
