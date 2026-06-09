import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async openPhoneSignIn() {
    await this.page.getByRole('button', { name: /legacy phone sign-in|phone sign-in|вход по телефону/i }).click();
  }

  async loginWithPhone(phone: string, password: string) {
    await this.openPhoneSignIn();
    await this.page.getByPlaceholder('+1234567890').fill(phone);
    await this.page.locator('input[type="password"]').fill(password);
    const loginResponse = this.page.waitForResponse(
      (res) => res.url().includes('/auth/login/phone') && res.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await this.page.locator('form').getByRole('button', { name: /^login$/i }).click();
    const response = await loginResponse;
    if (!response.ok()) {
      throw new Error(`Login API ${response.status()}: ${await response.text()}`);
    }
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
  }
}
