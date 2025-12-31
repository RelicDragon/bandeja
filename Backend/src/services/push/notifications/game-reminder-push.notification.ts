import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';

export async function createGameReminderPushNotification(
  gameId: string,
  recipient: any,
  hoursBeforeStart: number
): Promise<NotificationPayload | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      club: true,
      court: {
        include: {
          club: true,
        },
      },
    },
  });

  if (!game) {
    return null;
  }

  const lang = recipient.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);

  const title = hoursBeforeStart === 24 
    ? t('telegram.gameReminder24h', lang) 
    : t('telegram.gameReminder2h', lang);
  
  let body = `${entityTypeLabel}`;
  if (game.name) {
    body += `: ${game.name}`;
  }
  body += `\n${gameInfo.place} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.GAME_REMINDER,
    title,
    body,
    data: {
      gameId: game.id
    },
    sound: 'default'
  };
}
