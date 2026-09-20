/**
 * PRD 346 — "you were noted as a no-show" push.
 *
 * Deliberately gentle: the copy says what happened and invites a reply in the
 * game chat. It never mentions a penalty, because there is none — the note is
 * informative and the organizer can undo it for seven days.
 */
import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser, getEntityTypeLabel } from '../../shared/notification-base';

export async function createGameNoShowNotedPushNotification(
  gameId: string,
  recipientUserId: string,
): Promise<NotificationPayload | null> {
  const [game, recipient] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      include: {
        club: true,
        court: { include: { club: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { id: true, language: true, currentCityId: true },
    }),
  ]);

  if (!game || !recipient) {
    return null;
  }

  const lang = recipient.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, recipient.currentCityId, lang);
  const entityLabel = getEntityTypeLabel(game.entityType, lang);

  const title = entityLabel
    ? `${entityLabel}: ${t('attendance.noShowNotedTitle', lang)}`
    : t('attendance.noShowNotedTitle', lang);

  const body =
    `${gameInfo.place} ${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}` +
    `\n${t('attendance.noShowNotedBody', lang)}`;

  return {
    type: NotificationType.GAME_NO_SHOW_NOTED,
    title,
    body,
    data: {
      gameId: game.id,
      entityType: game.entityType,
      // Tapping the push must land in the game chat so a mistake can be cleared
      // up in one step.
      chatContextType: 'GAME',
      contextId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
    },
    sound: 'default',
  };
}
