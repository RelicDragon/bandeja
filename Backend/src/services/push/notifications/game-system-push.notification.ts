import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';

function translateSystemMessage(message: any, lang: string): string {
  let messageData: any = null;
  let messageContent = '';
  try {
    messageData = JSON.parse(message.content);
    messageContent = messageData.text || message.content;
  } catch {
    messageContent = message.content || '';
  }

  if (messageData && messageData.type && messageData.variables) {
    const translationKey = `chat.systemMessages.${messageData.type}`;
    let template = t(translationKey, lang);
    
    if (template === translationKey) {
      template = messageData.text || messageContent;
    } else {
      for (const [key, value] of Object.entries(messageData.variables)) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
      }
      messageContent = template;
    }
  }

  return messageContent;
}

export async function createGameSystemMessagePushNotification(
  message: any,
  game: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const translatedContent = translateSystemMessage(message, lang);

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title: `${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`,
    body: `🔔 ${translatedContent}`,
    data: {
      gameId: game.id,
      messageId: message.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}
