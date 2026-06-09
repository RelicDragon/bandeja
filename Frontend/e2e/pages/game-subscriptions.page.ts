import type { Locator, Page } from '@playwright/test';

export class GameSubscriptionsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/game-subscriptions');
    await this.page.waitForURL(/\/game-subscriptions\/?$/, { timeout: 20_000 });
  }

  async waitForLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/game-subscriptions') && res.request().method() === 'GET' && res.ok(),
      { timeout: 30_000 },
    ).catch(() => undefined);
    const spinner = this.page.locator('.animate-spin').first();
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  pageHeading(): Locator {
    return this.page.getByRole('heading', { name: /game subscriptions/i });
  }

  emptyState(): Locator {
    return this.page.getByText(/no subscriptions yet/i);
  }

  addSubscriptionButton(): Locator {
    return this.page.getByRole('button', { name: /add subscription/i });
  }

  subscriptionCards(): Locator {
    return this.page.locator('.space-y-6 > div').filter({ has: this.page.locator('button[title*="Edit" i], button[title*="Delete" i]') });
  }

  saveFormButton(): Locator {
    return this.page.getByRole('button', { name: /^save$/i });
  }

  deleteButtons(): Locator {
    return this.page.locator('button[title*="Delete" i], button').filter({ has: this.page.locator('svg') }).filter({ hasText: '' });
  }

  confirmDeleteButton(): Locator {
    return this.page.getByRole('dialog').getByRole('button', { name: /^delete$/i });
  }
}
