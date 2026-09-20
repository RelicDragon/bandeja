import notificationService from '../notification.service';
import { NotificationType } from '../../types/notifications.types';
import { buildMonthlyRecapPushPayload } from './recapPushCopy';

/**
 * PRD 353 — dispatch of the "your recap is ready" notification.
 *
 * Mapped to `SEND_REMINDERS` in `NOTIFICATION_TYPE_TO_PREF`, so a user who has
 * reminders off never gets it. It is sent once, only for a recap the current
 * pass actually created — the unique `(userId, monthKey)` is what makes the
 * 1st/2nd/3rd retries silent.
 */
export async function sendMonthlyRecapReadyNotification(options: {
  userId: string;
  monthKey: string;
  monthStart: string;
  language: string | null;
}): Promise<void> {
  await notificationService.sendNotification({
    userId: options.userId,
    type: NotificationType.MONTHLY_RECAP_READY,
    payload: buildMonthlyRecapPushPayload(options),
  });
}
