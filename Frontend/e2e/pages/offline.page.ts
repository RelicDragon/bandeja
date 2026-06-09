import { expect, type Page } from '@playwright/test';

export class OfflinePage {
  constructor(private readonly page: Page) {}

  noInternetScreen() {
    return this.page.getByRole('heading', { name: /no internet connection/i });
  }

  async expectOfflineGate() {
    await expect(this.noInternetScreen()).toBeVisible({ timeout: 20_000 });
  }

  async expectNoOfflineGate() {
    await expect(this.noInternetScreen()).toHaveCount(0);
  }
}
