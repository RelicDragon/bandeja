import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async openPhoneSignIn() {
    await this.page.getByRole('button', { name: /legacy phone sign-in|sign in with phone|phone sign-in|вход по телефону/i }).click();
  }

  async fillPhoneCredentials(phone: string, password: string) {
    await this.page.getByPlaceholder('+1234567890').fill(phone);
    await this.page.locator('input[type="password"]').fill(password);
  }

  async loginWithPhone(phone: string, password: string) {
    await this.openPhoneSignIn();
    await this.fillPhoneCredentials(phone, password);
    await this.page.getByRole('button', { name: /^login$/i }).click();
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
  }

  async loginWithInvalidCredentials(phone: string, password: string) {
    await this.openPhoneSignIn();
    await this.fillPhoneCredentials(phone, password);
    await this.page.getByRole('button', { name: /^login$/i }).click();
    await expect(this.page.getByText(/invalid phone number or password/i)).toBeVisible({ timeout: 15_000 });
    await expect(this.page).toHaveURL(/\/login/);
  }

  async expectPhoneFormVisible() {
    await expect(this.page.getByPlaceholder('+1234567890')).toBeVisible();
    await expect(this.page.locator('input[type="password"]')).toBeVisible();
  }

  async expectMainTabVisible() {
    await expect(this.page.getByRole('button', { name: /login with telegram/i })).toBeVisible();
  }
}
