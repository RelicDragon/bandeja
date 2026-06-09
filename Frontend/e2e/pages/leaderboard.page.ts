import type { Locator, Page } from '@playwright/test';

export class LeaderboardPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/leaderboard');
    await this.page.waitForURL(/\/leaderboard\/?$/, { timeout: 20_000 });
  }

  async waitForLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/rankings/') && res.ok(),
      { timeout: 30_000 },
    ).catch(() => undefined);
    const spinner = this.page.locator('.animate-spin').first();
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  rankingRows(): Locator {
    return this.page.locator('table tbody tr');
  }

  emptyState(): Locator {
    return this.page.getByText(/no leaderboard data/i);
  }
}
