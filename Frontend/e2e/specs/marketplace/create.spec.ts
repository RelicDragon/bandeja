import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { withdrawMarketListingViaApi } from '../../fixtures/marketplace.fixture';
import { ShellPage } from '../../pages/shell.page';
import { MarketplacePage } from '../../pages/marketplace.page';

test.describe('marketplace create @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('M-10 Create buy-it-now', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoCreate();
    const title = `[E2E] M-10 ${Date.now()}`;
    await marketplace.fillTitle(title);
    await marketplace.fillDescription('E2E buy it now listing');
    await marketplace.selectFirstCategoryIfNeeded();
    await marketplace.selectTradeType(/^price$|buy now/i);
    await marketplace.fillPrice('25');
    await marketplace.submitCreate();
    await expect(page).toHaveURL(/\/marketplace\//, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });

    const match = page.url().match(/\/marketplace\/([^/?#]+)/);
    const itemId = match?.[1];
    if (itemId && itemId !== 'create' && itemId !== 'my') {
      const { token } = await e2eLogin();
      await withdrawMarketListingViaApi(token, itemId);
    }
  });

  test('M-11 Create auction rising', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoCreate();
    const title = `[E2E] M-11 ${Date.now()}`;
    await marketplace.fillTitle(title);
    await marketplace.selectFirstCategoryIfNeeded();
    await marketplace.selectTradeType(/auction/i);
    await marketplace.fillPrice('10');
    await marketplace.selectAuctionDurationDays(3);
    await marketplace.submitCreate();
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });

    const match = page.url().match(/\/marketplace\/([^/?#]+)/);
    const itemId = match?.[1];
    if (itemId && itemId !== 'create' && itemId !== 'my') {
      const { token } = await e2eLogin();
      await withdrawMarketListingViaApi(token, itemId);
    }
  });

  test('M-14 Create free item', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoCreate();
    const title = `[E2E] M-14 ${Date.now()}`;
    await marketplace.fillTitle(title);
    await marketplace.selectFirstCategoryIfNeeded();
    await marketplace.selectTradeType(/^free$/i);
    await marketplace.submitCreate();
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^free$/i).first()).toBeVisible();

    const match = page.url().match(/\/marketplace\/([^/?#]+)/);
    const itemId = match?.[1];
    if (itemId && itemId !== 'create' && itemId !== 'my') {
      const { token } = await e2eLogin();
      await withdrawMarketListingViaApi(token, itemId);
    }
  });

  test('M-15 Validation errors', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    await marketplace.gotoCreate();
    await marketplace.createSubmitButton().click();
    await expect(page.getByText(/title is required|category is required/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('M-17 Draft restore', async ({ page }) => {
    const marketplace = new MarketplacePage(page);
    const draftTitle = `[E2E] M-17 draft ${Date.now()}`;
    await marketplace.gotoCreate();
    await marketplace.seedCreateDraft(draftTitle);
    await page.reload();
    await marketplace.titleInput().waitFor({ state: 'visible', timeout: 15_000 });
    await expect.poll(() => marketplace.draftTitleValue()).toBe(draftTitle);
    await page.evaluate(() => localStorage.removeItem('marketplace_create_draft'));
  });
});
