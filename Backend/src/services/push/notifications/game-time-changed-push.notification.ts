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
  /**
   * A combined notice for several games of one batch: `gameId` is the next
   * affected game (what the tap opens, also on store builds), `deliveryKey`
   * collapses per batch. `seriesId` / `gameIds` are additive extras.
   */
  batch?: { batchKey: string; seriesId: string | null; gameIds: string[] },
): NotificationPayload {
  return {
    type: NotificationType.GAME_TIME_CHANGED,
    title: copy.title,
    body: copy.lines.join('\n'),
    data: {
      gameId,
      entityType,
      shortDayOfWeek: copy.shortDayOfWeek,
      deliveryKey: batch ? `game-time-changed:${batch.batchKey}` : `game-time-changed:${gameId}`,
      ...(batch
        ? {
            ...(batch.seriesId ? { seriesId: batch.seriesId } : {}),
            gameIds: batch.gameIds.join(','),
          }
        : {}),
    },
    sound: 'default',
  };
}
