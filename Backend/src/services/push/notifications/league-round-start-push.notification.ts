import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

export async function createLeagueRoundStartPushNotification(
  game: any,
  user: any
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.PUSH, PreferenceKey.SEND_MESSAGES);
  if (!allowed) return null;

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);

  const leagueName = game.leagueSeason?.league?.name || 'League';
  const roundNumber = game.leagueRound?.orderIndex !== undefined ? game.leagueRound.orderIndex + 1 : 1;

  const title = t('telegram.leagueRoundStartReceived', lang);
  const body = `${leagueName} - ${t('telegram.round', lang)} ${roundNumber}\n${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

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

