import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import {
  formatGameContextHeader,
  formatGameInfoForUser,
  getEntityTypeLabel,
} from '../../shared/notification-base';
import { translateSystemMessageContent } from '../../../utils/translateSystemMessageContent';

export async function createGameSystemMessagePushNotification(
  message: any,
  game: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const translatedContent = translateSystemMessageContent(message, lang, game.entityType);
  const entityLabel = getEntityTypeLabel(game.entityType, lang);

  const baseTitle = formatGameContextHeader(gameInfo, { includeDuration: false });
  const title = entityLabel ? `${entityLabel}: ${baseTitle}` : baseTitle;

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title,
    body: `🔔 ${translatedContent}`,
    data: {
      gameId: game.id,
      messageId: message.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}
