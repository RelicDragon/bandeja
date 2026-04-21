import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';

export async function createMatchTimerCapPushNotification(
  gameId: string,
  matchId: string,
  userId: string
): Promise<NotificationPayload | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: { include: { club: true } },
      club: true,
      participants: {
        where: { userId, status: 'PLAYING' },
        include: {
          user: { select: { language: true, currentCityId: true } } },
      },
    },
  });

  if (!game || game.participants.length === 0) return null;

  const participant = game.participants[0];
  const lang = participant.user.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, participant.user.currentCityId, lang);
  const gameName = game.name ? game.name : t(`games.gameTypes.${game.gameType}`, lang);
  const clubName = game.court?.club?.name || game.club?.name;

  const title = t('push.matchTimerCap.title', lang);
  let body = gameName;
  if (clubName) body += ` — ${clubName}`;
  body += `\n${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`;

  return {
    type: NotificationType.MATCH_TIMER_CAP,
    title,
    body,
    data: {
      gameId: game.id,
      matchId,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
    },
    sound: 'default',
  };
}
