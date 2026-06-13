import { expect, type Page } from '@playwright/test';

export class SelectCityPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/select-city');
  }

  async expectLoaded() {
    await expect(this.heading()).toBeVisible({ timeout: 20_000 });
  }

  heading() {
    return this.page.getByRole('heading', { name: /select.*city|choose.*city/i });
  }

  cityButtons() {
    return this.page.locator('button').filter({ hasText: /.+/ });
  }

  async pickCityByName(cityName: string, countryKey?: string) {
    await expect(this.page).toHaveURL(/\/select-city/);
    await expect(this.page.locator('form .animate-spin')).toHaveCount(0, { timeout: 30_000 });

    const search = this.page.getByPlaceholder(/search countries|search city/i);
    await expect(search).toBeEnabled({ timeout: 30_000 });

    if (countryKey) {
      await search.fill(countryKey);
      await this.page.getByRole('button').filter({ hasText: new RegExp(countryKey, 'i') }).first().click();
      await expect(search).toBeEnabled();
    }

    await search.fill(cityName);
    await this.page.getByRole('button', { name: new RegExp(cityName, 'i') }).first().click();

    const confirm = this.page.getByRole('button', { name: /^confirm$/i });
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }

  async pickFirstCity() {
    const cityBtn = this.page.locator('button[type="button"]').filter({ hasNotText: /continue|confirm|back/i }).first();
    await cityBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await cityBtn.click();
    await this.page.getByRole('button', { name: /continue|confirm|save|select/i }).click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }
}
