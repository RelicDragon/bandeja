import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUserWithTimezone, formatNewGameText } from '../../shared/notification-base';

export async function createNewGamePushNotification(
  game: any,
  recipient: any
): Promise<NotificationPayload | null> {
  if (!game || !recipient) {
    return null;
  }

  const lang = recipient.language || 'en';
  const { gameInfo, timezone } = await formatGameInfoForUserWithTimezone(game, recipient.currentCityId, lang);
  const gameText = await formatNewGameText(game, timezone, lang, {
    includeParticipants: true,
    includeLink: false,
    escapeMarkdown: false,
    existingGameInfo: gameInfo,
  });

  const title = t('telegram.newGameCreated', lang) || 'New game created';
  const body = gameText;

  return {
    type: NotificationType.NEW_GAME,
    title,
    body,
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}

