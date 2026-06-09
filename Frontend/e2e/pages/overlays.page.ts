import { expect, type Page } from '@playwright/test';

export class OverlaysPage {
  constructor(private readonly page: Page) {}

  playerSheet() {
    return this.page.locator('[data-testid="player-card-sheet"], [role="dialog"]').filter({
      has: this.page.getByRole('button', { name: /^close$/i }),
    }).first();
  }

  async expectPlayerOverlayOpen() {
    await expect(this.page.getByRole('button', { name: /^close$/i }).first()).toBeVisible({ timeout: 20_000 });
  }

  async closePlayerOverlay() {
    await this.page.getByRole('button', { name: /^close$/i }).first().click();
  }

  async expectPlayerQueryRemoved() {
    await expect(this.page).not.toHaveURL(/[?&]player=/);
  }

  marketplaceDrawerClose() {
    return this.page.getByRole('button', { name: /^close$/i });
  }

  async expectMarketplaceItemDrawer() {
    await expect(this.marketplaceDrawerClose()).toBeVisible({ timeout: 20_000 });
  }

  async closeMarketplaceDrawer() {
    await this.marketplaceDrawerClose().click();
  }

  async expectItemQueryRemoved() {
    await expect(this.page).not.toHaveURL(/[?&]item=/);
  }
}
