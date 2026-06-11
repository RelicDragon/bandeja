import { test, expect } from '@playwright/test';
import {
  createHollandAuctionListing,
  createRisingAuctionListing,
  placeBidViaApi,
  withdrawMarketListingViaApi,
} from '../../fixtures/marketplace.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { MarketplacePage } from '../../pages/marketplace.page';

test.describe('two-user marketplace @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-M-02 bid updates seller view @hybrid', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    const bidCents = 1_500;
    try {
      const title = `[E2E] T2-M-02 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 1_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      const marketB = new MarketplacePage(pageB);
      await marketB.gotoItem(itemId);
      await marketB.waitForItemLoaded(title);
      await expect(marketB.currentBidLabel().or(marketB.startingPriceLabel())).toBeVisible({
        timeout: 20_000,
      });

      await placeBidViaApi(sessions.tokenA, itemId, bidCents);

      await expect
        .poll(async () => {
          const labelVisible = await marketB.currentBidLabel().isVisible().catch(() => false);
          const priceVisible = await marketB.priceText(bidCents).first().isVisible().catch(() => false);
          return labelVisible && priceVisible;
        }, { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('T2-M-03 real-time auction @dual-browser', async ({ browser }) => {
    const { pageA, pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    const bidCents = 1_500;
    try {
      const title = `[E2E] T2-M-03 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 1_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      const marketA = new MarketplacePage(pageA);
      const marketB = new MarketplacePage(pageB);
      await Promise.all([
        marketA.gotoItem(itemId).then(() => marketA.waitForItemLoaded(title)),
        marketB.gotoItem(itemId).then(() => marketB.waitForItemLoaded(title)),
      ]);

      await placeBidViaApi(sessions.tokenA, itemId, bidCents);

      for (const market of [marketA, marketB]) {
        await expect
          .poll(async () => {
            const labelVisible = await market.currentBidLabel().isVisible().catch(() => false);
            const priceVisible = await market.priceText(bidCents).first().isVisible().catch(() => false);
            return labelVisible && priceVisible;
          }, { timeout: 20_000 })
          .toBe(true);
      }
    } finally {
      await cleanup();
    }
  });

  test('T2-M-03 Holland auction @dual-browser', async ({ browser }) => {
    const { pageA, pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    const startingPriceCents = 2_000;
    try {
      const title = `[E2E] T2-M-03 Holland ${Date.now()}`;
      const listing = await createHollandAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents,
        hollandDecrementCents: 500,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      const marketA = new MarketplacePage(pageA);
      const marketB = new MarketplacePage(pageB);
      await Promise.all([
        marketA.gotoItem(itemId).then(() => marketA.waitForItemLoaded(title)),
        marketB.gotoItem(itemId).then(() => marketB.waitForItemLoaded(title)),
      ]);

      for (const market of [marketA, marketB]) {
        await expect(market.currentPriceLabel()).toBeVisible({ timeout: 20_000 });
        await expect(market.priceText(startingPriceCents).first()).toBeVisible({ timeout: 20_000 });
      }

      await placeBidViaApi(sessions.tokenA, itemId, startingPriceCents);

      await expect
        .poll(async () => marketB.soldOrBidIndicator().isVisible().catch(() => false), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('M-24 Place bid @dual-browser', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    try {
      const title = `[E2E] M-24 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 1_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      const marketplace = new MarketplacePage(pageA);
      await pageA.goto(`/marketplace/${itemId}`);
      await pageA.getByRole('heading', { name: title }).waitFor({ state: 'visible', timeout: 20_000 });
      await marketplace.placeBidInModal('15');
      await expect(pageA.getByText(/bid placed|15[,.]00/i).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await cleanup();
    }
  });

  test('M-25 Bid too low @dual-browser', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    try {
      const title = `[E2E] M-25 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 2_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      const marketplace = new MarketplacePage(pageA);
      await pageA.goto(`/marketplace/${itemId}`);
      await pageA.getByRole('heading', { name: title }).waitFor({ state: 'visible', timeout: 20_000 });
      await marketplace.placeBidButton().click();
      await marketplace.bidAmountInput().fill('5');
      await marketplace.bidSubmitButton().click();
      await expect(pageA.getByText(/minimum bid|min\./i).first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  test('M-27 Real-time auction update @hybrid', async ({ browser }) => {
    const { pageA, pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let itemId = '';
    try {
      const title = `[E2E] M-27 ${Date.now()}`;
      const listing = await createRisingAuctionListing(sessions.tokenB, ids.userBId, {
        title,
        startingPriceCents: 1_000,
      });
      itemId = listing.id;
      registerTeardown(() => withdrawMarketListingViaApi(sessions.tokenB, itemId));

      await pageA.goto(`/marketplace/${itemId}`);
      await pageA.getByRole('heading', { name: title }).waitFor({ state: 'visible', timeout: 20_000 });
      await pageB.goto(`/marketplace/${itemId}`);
      await pageB.getByRole('heading', { name: title }).waitFor({ state: 'visible', timeout: 20_000 });

      await placeBidViaApi(sessions.tokenA, itemId, 1_500);

      await expect
        .poll(async () => pageB.getByText(/15[,.]00|1\s*500|€\s*15/i).first().isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });
});
