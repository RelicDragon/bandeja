import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../../user-timezone.service';
import { formatDuration } from '../../telegram/utils';

export async function createLeagueRoundStartPushNotification(
  game: any,
  user: any
): Promise<NotificationPayload | null> {
  if (!user.sendPushMessages) {
    return null;
  }

  const lang = user.language || 'en';
  const timezone = await getUserTimezoneFromCityId(user.currentCityId);
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';

  const leagueName = game.leagueSeason?.league?.name || 'League';
  const roundNumber = game.leagueRound?.orderIndex !== undefined ? game.leagueRound.orderIndex + 1 : 1;

  const title = t('telegram.leagueRoundStartReceived', lang);
  const body = `${leagueName} - ${t('telegram.round', lang)} ${roundNumber}\n${place} ${shortDate} ${startTime}, ${duration}`;

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

