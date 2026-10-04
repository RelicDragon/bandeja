/**
 * Time change — "the time changed" push.
 *
 * One per recipient per coalesced burst of edits. `deliveryKey` is per game, so
 * a second notice for the same game replaces the first on the lock screen
 * instead of stacking (Time-critical tier, collapsed per game).
 */
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import type { TimeChangeNoticeCopy } from '../../gameTimeChange/timeChangeNoticeCopy';

export function createGameTimeChangedPushNotification(
  gameId: string,
  entityType: string,
  copy: TimeChangeNoticeCopy,
): NotificationPayload {
  return {
    type: NotificationType.GAME_TIME_CHANGED,
    title: copy.title,
    body: copy.lines.join('\n'),
    data: {
      gameId,
      entityType,
      shortDayOfWeek: copy.shortDayOfWeek,
      deliveryKey: `game-time-changed:${gameId}`,
    },
    sound: 'default',
  };
}
