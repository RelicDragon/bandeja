/**
 * PRD 355 — "Ana sent you a gift 🎁".
 *
 * Fires once, when a purchase settles with a recipient other than the buyer.
 * Tapping it lands on the shop, where the item is already owned.
 */
import prisma from '../../../config/database';
import { NotificationPayload, NotificationType, PreferenceKey } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import { formatUserName } from '../../shared/notification-base';
import { NotificationPreferenceService } from '../../notificationPreference.service';
import { NotificationChannelType } from '@prisma/client';

type GiftSender = { id: string; firstName?: string | null; lastName?: string | null };

export async function createGoodsGiftReceivedPushNotification(
  sender: GiftSender,
  recipientUserId: string,
  goods: { id: string; name: string },
): Promise<NotificationPayload | null> {
  const allowed = await NotificationPreferenceService.doesUserAllow(
    recipientUserId,
    NotificationChannelType.PUSH,
    PreferenceKey.SEND_WALLET_NOTIFICATIONS,
  );
  if (!allowed) return null;

  const recipient = await prisma.user.findUnique({
    where: { id: recipientUserId },
    select: { id: true, language: true },
  });
  if (!recipient) return null;

  const lang = recipient.language || 'en';
  const senderName = formatUserName(sender).replace(/[\r\n]+/g, ' ').trim();

  return {
    type: NotificationType.GOODS_GIFT_RECEIVED,
    title: `${senderName} ${t('shop.giftSentYouAGift', lang)}`,
    body: `${goods.name}\n${t('shop.giftOpenCollection', lang)}`,
    data: {
      goodsId: goods.id,
      senderUserId: sender.id,
    },
    sound: 'default',
  };
}
