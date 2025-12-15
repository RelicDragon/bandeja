import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function createGameSystemMessagePushNotification(
  message: any,
  game: any,
  recipient: any
): Promise<NotificationPayload | null> {
  const lang = recipient.language || 'en';
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const timezone = await getUserTimezoneFromCityId(recipient.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);

  const messageContent = message.content || '';
  let translatedContent = messageContent;
  
  const messageData = message.metadata as any;
  if (messageData && messageData.type && messageData.variables) {
    const translationKey = `chat.systemMessages.${messageData.type}`;
    let template = t(translationKey, lang);
    
    if (template !== translationKey) {
      for (const [key, value] of Object.entries(messageData.variables)) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ''));
      }
      translatedContent = template;
    }
  }

  return {
    type: NotificationType.GAME_SYSTEM_MESSAGE,
    title: `${place} ${shortDate} ${startTime}`,
    body: `🔔 ${translatedContent}`,
    data: {
      gameId: game.id,
      messageId: message.id
    },
    sound: 'default'
  };
}
