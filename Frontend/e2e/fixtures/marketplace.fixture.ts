import { e2eApi, e2eGetProfile, type E2eUser } from './api-client';

type MarketCategory = { id: string; name?: string };
type MarketItem = { id: string; title?: string };

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

export type CreateListingBase = {
  title?: string;
  description?: string;
};

export type CreateAuctionOptions = CreateListingBase & {
  startingPriceCents?: number;
  auctionEndsAt?: string;
  auctionType?: 'RISING' | 'HOLLAND';
  hollandDecrementCents?: number;
  hollandIntervalMinutes?: number;
};

async function createListing(
  token: string,
  sellerId: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const user = await e2eGetProfile(token);
  if (user.id !== sellerId) {
    throw new Error('[e2e] createListing token must match sellerId');
  }
  const categoryId = await resolveCategoryId(token);
  const cityId = await resolveCityId(token, user);

  const item = await e2eApi<MarketItem>(token, '/market-items', {
    method: 'POST',
    body: JSON.stringify({
      categoryId,
      cityId,
      title: `[E2E] item ${Date.now()}`,
      description: 'E2E listing',
      mediaUrls: [],
      currency: 'EUR',
      ...body,
    }),
  });
  if (!item?.id) {
    throw new Error('[e2e] create listing response missing id');
  }
  return { id: item.id };
}

export async function createRisingAuctionListing(
  token: string,
  sellerId: string,
  options: CreateAuctionOptions = {},
): Promise<{ id: string }> {
  const endsAt = options.auctionEndsAt ?? new Date(Date.now() + 2 * 3_600_000).toISOString();
  return createListing(token, sellerId, {
    title: options.title ?? `[E2E] auction ${Date.now()}`,
    description: options.description ?? 'E2E rising auction',
    tradeTypes: ['AUCTION'],
    auctionType: options.auctionType ?? 'RISING',
    startingPriceCents: options.startingPriceCents ?? 1_000,
    auctionEndsAt: endsAt,
    hollandDecrementCents: options.hollandDecrementCents,
    hollandIntervalMinutes: options.hollandIntervalMinutes,
  });
}

export async function createBuyItNowListing(
  token: string,
  sellerId: string,
  options: CreateListingBase & { priceCents?: number } = {},
): Promise<{ id: string }> {
  return createListing(token, sellerId, {
    title: options.title ?? `[E2E] buy-now ${Date.now()}`,
    description: options.description ?? 'E2E buy it now',
    tradeTypes: ['BUY_IT_NOW'],
    priceCents: options.priceCents ?? 2_500,
  });
}

export async function createFreeListing(
  token: string,
  sellerId: string,
  options: CreateListingBase = {},
): Promise<{ id: string }> {
  return createListing(token, sellerId, {
    title: options.title ?? `[E2E] free ${Date.now()}`,
    description: options.description ?? 'E2E free item',
    tradeTypes: ['FREE'],
  });
}

export async function createSuggestedPriceListing(
  token: string,
  sellerId: string,
  options: CreateListingBase = {},
): Promise<{ id: string }> {
  return createListing(token, sellerId, {
    title: options.title ?? `[E2E] suggested ${Date.now()}`,
    description: options.description ?? 'E2E suggested price',
    tradeTypes: ['SUGGESTED_PRICE'],
  });
}

export async function createHollandAuctionListing(
  token: string,
  sellerId: string,
  options: CreateAuctionOptions = {},
): Promise<{ id: string }> {
  return createRisingAuctionListing(token, sellerId, {
    ...options,
    auctionType: 'HOLLAND',
    hollandDecrementCents: options.hollandDecrementCents ?? 100,
    hollandIntervalMinutes: options.hollandIntervalMinutes ?? 5,
  });
}

export async function placeBidViaApi(token: string, itemId: string, amountCents: number): Promise<void> {
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

export async function updateMarketListingViaApi(
  token: string,
  itemId: string,
  patch: { title?: string; description?: string },
): Promise<void> {
  await e2eApi(token, `/market-items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}
