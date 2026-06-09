import type { Locator, Page } from '@playwright/test';

export class MarketplacePage {
  constructor(private readonly page: Page) {}

  async gotoList() {
    await this.page.goto('/marketplace');
    await this.page.waitForURL(/\/marketplace\/?(\?|$)/, { timeout: 20_000 });
  }

  async waitForListLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/marketplace') && res.ok(),
      { timeout: 30_000 },
    ).catch(() => undefined);
    const spinner = this.page.locator('.animate-spin').first();
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  itemCards(): Locator {
    return this.page.locator('article[role="button"]');
  }

  firstItemCard(): Locator {
    return this.page.locator('article[role="button"]').first();
  }

  emptyState(): Locator {
    return this.page.getByText(/no listings found/i);
  }

  drawerCloseButton(): Locator {
    return this.page.getByRole('button', { name: /^close$/i });
  }

  async openFirstItemDrawer() {
    await this.firstItemCard().click();
    await this.drawerCloseButton().waitFor({ state: 'visible', timeout: 15_000 });
  }
}
