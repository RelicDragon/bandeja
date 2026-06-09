import { expect, type Page } from '@playwright/test';

export class ProfilePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/profile');
    await this.page.waitForURL(/\/profile/, { timeout: 30_000 });
    await this.page.getByRole('button', { name: /^logout$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }

  async logout() {
    const logoutButton = this.page.getByRole('button', { name: /^logout$/i });
    await logoutButton.scrollIntoViewIfNeeded();
    await logoutButton.click();
    await this.page.waitForURL(/\/login/, { timeout: 20_000 });
  }

  async expectSessionCleared() {
    await expect(this.page).toHaveURL(/\/login/);
    const token = await this.page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  }
}
