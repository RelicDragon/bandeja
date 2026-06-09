import type { Locator, Page } from '@playwright/test';

export class UserProfilePage {
  constructor(private readonly page: Page) {}

  async goto(userId: string, query = '') {
    await this.page.goto(`/user-profile/${userId}${query ? `?${query}` : ''}`);
    await this.page.waitForURL(new RegExp(`/user-profile/${userId}`), { timeout: 20_000 });
  }

  guestPrompt(): Locator {
    return this.page.getByText(/login or register|join to participate|sign in/i).first();
  }

  profileContent(): Locator {
    return this.page.locator('main, [class*="min-h-screen"]').first();
  }

  shareButton(): Locator {
    return this.page.getByRole('button', { name: /share/i });
  }
}
