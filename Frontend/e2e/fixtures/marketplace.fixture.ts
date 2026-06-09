import { e2eApi, e2eGetProfile, type E2eUser } from './api-client';

type MarketCategory = { id: string; name?: string };
type MarketItem = { id: string };

async function resolveCategoryId(token: string): Promise<string> {
  const categories = await e2eApi<MarketCategory[]>(token, '/market-items/categories?sport=PADEL');
  const category = categories[0];
  if (!category?.id) {
    throw new Error('[e2e] No market categories — seed marketplace categories');
  }
  return category.id;
}

async function resolveCityId(token: string, user: E2eUser): Promise<string> {
  const profile = user.currentCity?.id ? user : await e2eGetProfile(token);
  const cityId = profile.currentCity?.id;
  if (!cityId) {
    throw new Error('[e2e] Seller has no currentCity');
  }
  return cityId;
}

export type CreateAuctionOptions = {
  title?: string;
  startingPriceCents?: number;
  auctionEndsAt?: string;
};

export async function createRisingAuctionListing(
  token: string,
  sellerId: string,
  options: CreateAuctionOptions = {},
): Promise<{ id: string }> {
  const user = await e2eGetProfile(token);
  if (user.id !== sellerId) {
    throw new Error('[e2e] createRisingAuctionListing token must match sellerId');
  }
  const categoryId = await resolveCategoryId(token);
  const cityId = await resolveCityId(token, user);
  const endsAt =
    options.auctionEndsAt ?? new Date(Date.now() + 2 * 3_600_000).toISOString();

  const item = await e2eApi<MarketItem>(token, '/market-items', {
    method: 'POST',
    body: JSON.stringify({
      categoryId,
      cityId,
      title: options.title ?? `[E2E] auction ${Date.now()}`,
      description: 'E2E rising auction',
      mediaUrls: [],
      tradeTypes: ['AUCTION'],
      currency: 'EUR',
      auctionType: 'RISING',
      startingPriceCents: options.startingPriceCents ?? 1_000,
      auctionEndsAt: endsAt,
    }),
  });
  if (!item?.id) {
    throw new Error('[e2e] create auction response missing id');
  }
  return { id: item.id };
}

export async function placeBidViaApi(
  token: string,
  itemId: string,
  amountCents: number,
): Promise<void> {
  await e2eApi(token, `/market-items/${itemId}/bids`, {
    method: 'POST',
    body: JSON.stringify({ amountCents }),
  });
}

export async function withdrawMarketListingViaApi(token: string, itemId: string): Promise<void> {
  try {
    await e2eApi(token, `/market-items/${itemId}/withdraw`, { method: 'POST', body: '{}' });
  } catch {
    /* already withdrawn */
  }
}
