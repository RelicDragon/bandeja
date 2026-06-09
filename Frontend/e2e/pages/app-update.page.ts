import { expect, type Page } from '@playwright/test';

export class AppUpdatePage {
  constructor(private readonly page: Page) {}

  blockingModal() {
    return this.page.getByRole('heading', { name: /update required/i });
  }

  optionalModal() {
    return this.page.getByRole('heading', { name: /update available/i });
  }

  laterButton() {
    return this.page.getByRole('button', { name: /^later$/i });
  }

  async expectBlockingUpdate() {
    await expect(this.blockingModal()).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByRole('button', { name: /^my$/i })).toHaveCount(0);
  }

  async expectOptionalUpdate() {
    await expect(this.optionalModal()).toBeVisible({ timeout: 20_000 });
  }

  async dismissOptionalUpdate() {
    await this.laterButton().click();
    await expect(this.optionalModal()).toHaveCount(0);
  }
}
