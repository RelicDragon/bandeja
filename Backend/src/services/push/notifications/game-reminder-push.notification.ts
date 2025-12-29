import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';
import { formatDuration } from '../../telegram/utils';

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
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const timezone = await getUserTimezoneFromCityId(recipient.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
  const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);

  const title = hoursBeforeStart === 24 
    ? t('telegram.gameReminder24h', lang) 
    : t('telegram.gameReminder2h', lang);
  
  let body = `${entityTypeLabel}`;
  if (game.name) {
    body += `: ${game.name}`;
  }
  body += `\n${place} ${shortDate} ${startTime}, ${duration}`;

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
