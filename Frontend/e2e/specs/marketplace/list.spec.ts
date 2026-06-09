import { test, expect } from '@playwright/test';
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

    const cards = page.locator('article[role="button"]');
    const empty = marketplace.emptyState();
    await expect(cards.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('M-21 Open item drawer', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoList();
    await marketplace.waitForListLoaded();

    const cardCount = await page.locator('article[role="button"]').count();
    test.skip(cardCount === 0, 'No marketplace listings in seeded data');

    await marketplace.openFirstItemDrawer();
    await expect(marketplace.drawerCloseButton()).toBeVisible();
    await expect(page.locator('article[role="button"]').first()).toBeVisible();
  });
});
