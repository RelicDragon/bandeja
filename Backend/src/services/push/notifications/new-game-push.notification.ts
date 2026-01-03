import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatNewGameText } from '../../shared/notification-base';
import { getUserTimezoneFromCityId } from '../../user-timezone.service';

export async function createNewGamePushNotification(
  game: any,
  recipient: any
): Promise<NotificationPayload | null> {
  if (!game || !recipient) {
    return null;
  }

  const lang = recipient.language || 'en';
  const timezone = await getUserTimezoneFromCityId(recipient.currentCityId);
  const gameText = await formatNewGameText(game, timezone, lang, {
    includeParticipants: true,
    includeLink: false,
    escapeMarkdown: false
  });

  const title = t('telegram.newGameCreated', lang) || 'New game created';
  const body = gameText;

  return {
    type: NotificationType.NEW_GAME,
    title,
    body,
    data: {
      gameId: game.id
    },
    sound: 'default'
  };
}

