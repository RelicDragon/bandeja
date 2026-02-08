import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';

export function createNewMarketItemPushNotification(
  marketItem: { id: string; title: string; priceCents: number | null; currency: string },
  cityName: string,
  lang: string
): NotificationPayload {
  const title = (t('marketplace.newListingTitle', lang) || 'New listing in {city}').replace('{city}', cityName);

  let body = marketItem.title;
  if (marketItem.priceCents != null) {
    const price = `${(marketItem.priceCents / 100).toFixed(2)} ${marketItem.currency}`;
    body = (t('marketplace.newListingBody', lang) || '{title} — {price}')
      .replace('{title}', marketItem.title)
      .replace('{price}', price);
  }

  return {
    type: NotificationType.NEW_MARKET_ITEM,
    title,
    body,
    data: {
      marketItemId: marketItem.id,
    },
    sound: 'default',
  };
}
