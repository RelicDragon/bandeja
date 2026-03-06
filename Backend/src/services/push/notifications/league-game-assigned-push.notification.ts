import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';
import { PreferenceKey } from '../../../types/notifications.types';

export async function createLeagueGameAssignedPushNotification(
  game: any,
  userId: string
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    userId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_INVITES
  );
  if (!allowed) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, language: true, currentCityId: true },
  });
  if (!user) return null;

  const lang = user.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, user.currentCityId, lang);
  const title = t('notifications.assignedToLeagueGame', lang);
  const body = `${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}, ${gameInfo.duration}`;

  return {
    type: NotificationType.INVITE,
    title,
    body,
    data: { gameId: game.id, shortDayOfWeek: gameInfo.shortDayOfWeek },
    sound: 'default',
  };
}
