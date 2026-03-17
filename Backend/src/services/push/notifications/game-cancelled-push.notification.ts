import { EntityType } from '@prisma/client';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';

export interface GameCancelledMeta {
  gameId: string;
  entityType: EntityType;
  name?: string;
  cancelledAt: string;
}

export async function createGameCancelledPushNotification(
  meta: GameCancelledMeta,
  recipient: { language?: string | null }
): Promise<NotificationPayload | null> {
  const lang = recipient.language || 'en';
  const title = t('push.gameCancelledTitle', lang);
  const body = meta.name
    ? t('push.gameCancelledBodyWithName', lang).replace('{{name}}', meta.name)
    : t('push.gameCancelledBody', lang);

  return {
    type: NotificationType.GAME_CANCELLED,
    title: title !== 'push.gameCancelledTitle' ? title : 'Cancelled',
    body: body || 'Cancelled by the organizer',
    data: { gameId: meta.gameId },
    sound: 'default',
  };
}
