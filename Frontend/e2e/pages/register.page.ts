import { expect, type Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/register');
  }

  async expectLoaded() {
    await expect(this.page.getByRole('heading', { name: /^register$/i })).toBeVisible();
    await expect(this.page).toHaveURL(/\/register/);
  }
}
