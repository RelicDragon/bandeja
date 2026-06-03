import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import {
  formatGameContextHeader,
  formatGameInfoForUser,
  getEntityTypeLabel,
  resolveGameClubPlace,
} from '../../shared/notification-base';

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
      const variables = { ...messageData.variables } as Record<string, string>;
      if (messageData.type === 'GAME_CLUB_CHANGED' && !variables.clubName?.trim()) {
        variables.clubName = resolveGameClubPlace({}, lang);
      }
      if (messageData.type === 'GAME_DATE_TIME_CHANGED' && !variables.dateTime?.trim()) {
        const datetimeKey = 'games.datetimeNotSet';
        variables.dateTime =
          t(datetimeKey, lang) !== datetimeKey ? t(datetimeKey, lang) : 'Time is not set yet';
      }
      for (const [key, value] of Object.entries(variables)) {
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
