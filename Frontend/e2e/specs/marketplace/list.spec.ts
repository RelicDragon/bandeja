import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import {
  createBuyItNowListing,
  createRisingAuctionListing,
  withdrawMarketListingViaApi,
} from '../../fixtures/marketplace.fixture';
import { ShellPage } from '../../pages/shell.page';
import { MarketplacePage } from '../../pages/marketplace.page';

test.describe('marketplace browse @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('M-01 List loads', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();

    const cards = marketplace.itemCards();
    const empty = marketplace.emptyState();
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('M-02 My listings', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const title = `[E2E] M-02 ${Date.now()}`;
    const listing = await createBuyItNowListing(token, user.id, { title });
    try {
      const marketplace = new MarketplacePage(page);
      await marketplace.gotoMyListings();
      await marketplace.waitForListLoaded();
      await expect(marketplace.myListingsLabel()).toBeVisible();
      await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
    } finally {
      await withdrawMarketListingViaApi(token, listing.id);
    }
  });

  test('M-03 Category filter', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();

    const categories = page.locator('button[type="button"]').filter({ hasText: /.+/ });
    const count = await categories.count();
    test.skip(count < 2, 'Need multiple categories');

    const firstLabel = await categories.nth(0).innerText();
    await categories.nth(1).click();
    await marketplace.waitForListLoaded();
    await expect(categories.nth(1)).toHaveClass(/primary|bg-primary/);
    void firstLabel;
  });

  test('M-07 Pagination / infinite scroll', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();

    const initial = await marketplace.itemCards().count();
    if (initial < 10) {
      test.skip(true, 'Not enough listings for scroll pagination');
    }

    await marketplace.scrollListToEnd();
    await expect
      .poll(async () => marketplace.itemCards().count(), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(initial);
  });

  test('M-21 Open item drawer', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();

    const cardCount = await marketplace.itemCards().count();
    test.skip(cardCount === 0, 'No marketplace listings in seeded data');

    await marketplace.openFirstItemDrawer();
    await expect(marketplace.drawerCloseButton()).toBeVisible();
  });

  test('M-22 Deep link item', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const title = `[E2E] M-22 ${Date.now()}`;
    const listing = await createBuyItNowListing(token, user.id, { title });
    try {
      const marketplace = new MarketplacePage(page);
      await marketplace.gotoItemDeepLink(listing.id);
      await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(new RegExp(`item=${listing.id}|/marketplace/${listing.id}`));
    } finally {
      await withdrawMarketListingViaApi(token, listing.id);
    }
  });

  test('M-23 Item not found', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoItemDeepLink('00000000-0000-0000-0000-000000000000');
    await expect(marketplace.notFoundState()).toBeVisible({ timeout: 20_000 });
  });

  test('M-35 Overlay open item', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const title = `[E2E] M-35 ${Date.now()}`;
    const listing = await createBuyItNowListing(token, user.id, { title });
    try {
      const marketplace = new MarketplacePage(page);
      await marketplace.gotoList(`item=${listing.id}`);
      await marketplace.waitForListLoaded();
      await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
      await expect(marketplace.drawerCloseButton()).toBeVisible();
    } finally {
      await withdrawMarketListingViaApi(token, listing.id);
    }
  });
});

test.describe('marketplace item transactions @auth', () => {
  test('M-26 View bid history', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    const { token, user } = await e2eLogin();
    const title = `[E2E] M-26 ${Date.now()}`;
    const listing = await createRisingAuctionListing(token, user.id, { title, startingPriceCents: 1_000 });
    try {
      const marketplace = new MarketplacePage(page);
      await marketplace.gotoItemDeepLink(listing.id);
      await page.getByText(title).waitFor({ state: 'visible', timeout: 20_000 });
      await marketplace.viewBidsButton().click();
      await expect(page.getByRole('heading', { name: /bids|bid history/i })).toBeVisible({ timeout: 15_000 });
    } finally {
      await withdrawMarketListingViaApi(token, listing.id);
    }
  });
});
