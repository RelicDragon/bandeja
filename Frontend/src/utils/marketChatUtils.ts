import { GroupChannel } from '@/api/chat';

function displayName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!user) return '';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || '';
}

export const getMarketChatDisplayTitle = (
  channel: GroupChannel,
  userId: string,
  role: 'buyer' | 'seller'
): string => {
  const title = channel.marketItem?.title?.trim() || '';
  if (role === 'buyer') {
    const sellerName = displayName(channel.marketItem?.seller);
    return sellerName ? `${title || 'Listing'} · ${sellerName}` : title || channel.name || 'Market chat';
  }
  const buyerName = displayName(channel.buyer);
  return buyerName ? `${title || 'Listing'} · with ${buyerName}` : title || channel.name || 'Market chat';
};

export const getMarketChatDisplayTitleForSellerGrouped = (channel: GroupChannel): string =>
  displayName(channel.buyer) || channel.name || 'Chat';

export const getMarketChatDisplayParts = (
  channel: GroupChannel,
  _userId: string,
  role: 'buyer' | 'seller'
): { title: string; subtitle?: string } => {
  const itemTitle = channel.marketItem?.title?.trim() || '';
  if (role === 'buyer') {
    const sellerName = displayName(channel.marketItem?.seller);
    return {
      title: itemTitle || channel.name || 'Market chat',
      subtitle: sellerName || undefined
    };
  }
  return { title: getMarketChatDisplayTitle(channel, _userId, role) };
};
