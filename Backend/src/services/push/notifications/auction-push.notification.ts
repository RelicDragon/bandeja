import { PriceCurrency } from '@prisma/client';
import { NotificationPayload, NotificationType } from '../../../types/notifications.types';
import { t } from '../../../utils/translations';
import CurrencyService from '../../currency.service';

export function createAuctionOutbidPushNotification(
  marketItem: { id: string; title: string },
  newHighCents: number,
  currency: string,
  lang: string
): NotificationPayload {
  const price = CurrencyService.formatPrice(newHighCents, currency as PriceCurrency);
  const title = t('marketplace.auctionOutbidTitle', lang) || 'You were outbid';
  const body = (t('marketplace.auctionOutbidBody', lang) || 'Your bid on "{title}" was exceeded. Current bid: {price}')
    .replace('{title}', marketItem.title)
    .replace('{price}', price);
  return {
    type: NotificationType.AUCTION_OUTBID,
    title,
    body,
    data: { marketItemId: marketItem.id },
    sound: 'default',
  };
}

export function createAuctionNewBidPushNotification(
  marketItem: { id: string; title: string },
  amountCents: number,
  currency: string,
  lang: string
): NotificationPayload {
  const price = CurrencyService.formatPrice(amountCents, currency as PriceCurrency);
  const title = t('marketplace.auctionNewBidTitle', lang) || 'New bid on your item';
  const body = (t('marketplace.auctionNewBidBody', lang) || '"{title}" — new bid: {price}')
    .replace('{title}', marketItem.title)
    .replace('{price}', price);
  return {
    type: NotificationType.AUCTION_NEW_BID,
    title,
    body,
    data: { marketItemId: marketItem.id },
    sound: 'default',
  };
}

export function createAuctionWonPushNotification(
  marketItem: { id: string; title: string },
  lang: string
): NotificationPayload {
  const title = t('marketplace.auctionWonTitle', lang) || 'You won!';
  const body = (t('marketplace.auctionWonBody', lang) || 'You won the auction for "{title}"').replace(
    '{title}',
    marketItem.title
  );
  return {
    type: NotificationType.AUCTION_WON,
    title,
    body,
    data: { marketItemId: marketItem.id },
    sound: 'default',
  };
}

export function createAuctionBINAcceptedPushNotification(
  marketItem: { id: string; title: string },
  isBuyer: boolean,
  lang: string
): NotificationPayload {
  const title = isBuyer
    ? (t('marketplace.binAcceptedBuyerTitle', lang) || 'Purchase confirmed')
    : (t('marketplace.binAcceptedSellerTitle', lang) || 'Item sold');
  const body = (t('marketplace.binAcceptedBody', lang) || '"{title}"').replace('{title}', marketItem.title);
  return {
    type: NotificationType.AUCTION_BIN_ACCEPTED,
    title,
    body,
    data: { marketItemId: marketItem.id },
    sound: 'default',
  };
}
