import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { formatGameInfoForUser, formatUserName } from '../../shared/notification-base';

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

  const title = `${gameInfo.place} ${gameInfo.shortDate} ${gameInfo.startTime}`;
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
