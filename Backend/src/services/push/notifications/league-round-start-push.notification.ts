import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { withOptionalSportPrefix } from '../../shared/notificationSport';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';
import { leagueRoundStartPushScheduleExtras } from '../../league/leagueBracketDeepLink.util';
import {
  leagueRoundStartNotificationBodyPrefix,
  leagueRoundStartNotificationTitleKey,
} from '../../league/leagueRoundStartNotificationCopy.util';

export async function createLeagueRoundStartPushNotification(
  game: any,
  user: any
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(user.id, NotificationChannelType.PUSH, PreferenceKey.SEND_MESSAGES);
  if (!allowed) return null;

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);

  const title = withOptionalSportPrefix(
    t(leagueRoundStartNotificationTitleKey(game), lang),
    game.sport,
    user.primarySport,
    lang,
  );
  const body = `${leagueRoundStartNotificationBodyPrefix(game, lang)}\n${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.GAME_REMINDER,
    title,
    body,
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
      ...leagueRoundStartPushScheduleExtras(game),
    },
    sound: 'default'
  };
}

