import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { buildGameReminderTitle } from '../../shared/notificationSport';

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

  const title = buildGameReminderTitle(
    game.entityType,
    hoursBeforeStart,
    game.sport,
    recipient.primarySport,
    lang,
  );
  
  let body = `${entityTypeLabel}`;
  if (game.name) {
    body += `: ${game.name}`;
  }
  body += `\n${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.GAME_REMINDER,
    title,
    body,
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek
    },
    sound: 'default'
  };
}
