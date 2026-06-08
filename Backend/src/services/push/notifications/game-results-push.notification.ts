import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { buildGameResultsContext } from '../../shared/notification-contexts/game-results.context';

export async function createGameResultsPushNotification(
  gameId: string,
  userId: string,
  isEdited: boolean = false
): Promise<NotificationPayload | null> {
  const ctx = await buildGameResultsContext(gameId, userId, isEdited);
  if (!ctx) {
    return null;
  }

  return {
    type: NotificationType.GAME_RESULTS,
    title: ctx.title,
    body: ctx.bodyLines.join('\n'),
    data: {
      gameId: ctx.gameId,
      shortDayOfWeek: ctx.shortDayOfWeek,
    },
    sound: 'default',
  };
}
