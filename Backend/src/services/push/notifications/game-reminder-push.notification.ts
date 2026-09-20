import prisma from '../../../config/database';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser } from '../../shared/notification-base';
import { buildGameReminderTitle } from '../../shared/notificationSport';
import { signPushInviteActionToken } from '../pushInviteActionToken.service';

/** PRD 346 — the reminder can carry the two attendance shade actions. */
export type GameReminderPushOptions = {
  /**
   * Attach "I'm coming" / "Not sure yet" shade actions. The caller decides —
   * the reminder is still only a reminder, and the actions never change a seat.
   */
  attendanceActions?: boolean;
};

export async function createGameReminderPushNotification(
  gameId: string,
  recipient: any,
  hoursBeforeStart: number,
  options: GameReminderPushOptions = {}
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

  if (!options.attendanceActions) {
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

  const confirmTitle = t('attendance.confirmAction', lang);
  const unsureTitle = t('attendance.unsureAction', lang);

  return {
    type: NotificationType.GAME_REMINDER,
    title,
    body: `${body}\n${t('attendance.telegramQuestion', lang)}`,
    data: {
      gameId: game.id,
      shortDayOfWeek: gameInfo.shortDayOfWeek,
      attendanceActionToken: signPushInviteActionToken({
        userId: recipient.id,
        kind: 'attendance',
        targetId: game.id,
        action: 'confirm',
      }),
      attendanceUnsureActionToken: signPushInviteActionToken({
        userId: recipient.id,
        kind: 'attendance',
        targetId: game.id,
        action: 'unsure',
      }),
      confirmActionTitle: confirmTitle,
      unsureActionTitle: unsureTitle,
    },
    actions: [
      { id: 'confirm', title: confirmTitle, action: 'confirm' },
      { id: 'unsure', title: unsureTitle, action: 'unsure' },
    ],
    sound: 'default'
  };
}
