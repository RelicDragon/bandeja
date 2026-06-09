import { expect, type Page } from '@playwright/test';

export class SelectCityPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/select-city');
  }

  async expectLoaded() {
    await expect(this.page.getByRole('heading', { name: /select city|choose city/i })).toBeVisible({ timeout: 20_000 });
  }

  cityButtons() {
    return this.page.locator('button').filter({ hasText: /.+/ });
  }

  async pickFirstCity() {
    const cityBtn = this.page.locator('button[type="button"]').filter({ hasNotText: /continue|confirm|back/i }).first();
    await cityBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await cityBtn.click();
    await this.page.getByRole('button', { name: /continue|confirm|save|select/i }).click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }
}
