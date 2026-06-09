import { expect, type Locator, type Page } from '@playwright/test';

export type LeaderboardType = 'level' | 'games' | 'social';

const LEADERBOARD_TYPE_INDEX: Record<LeaderboardType, number> = {
  level: 0,
  games: 1,
  social: 2,
};

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

  leaderboardTablist(): Locator {
    return this.page.locator('header').getByRole('tablist').first();
  }

  async switchType(type: LeaderboardType) {
    const response = this.page.waitForResponse(
      (res) => res.url().includes('/rankings/user-context') && res.ok(),
      { timeout: 30_000 },
    );
    const tab = this.leaderboardTablist().getByRole('tab').nth(LEADERBOARD_TYPE_INDEX[type]);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await response.catch(() => undefined);
    await this.waitForLoaded();
  }

  sportPicker(): Locator {
    return this.page.getByRole('group').filter({ has: this.page.locator('button') });
  }

  rankingRows(): Locator {
    return this.page.locator('table tbody tr');
  }

  currentUserRow(): Locator {
    return this.page.locator('table tbody tr').filter({ hasText: /\(you\)/i });
  }

  emptyState(): Locator {
    return this.page.getByText(/no leaderboard data/i);
  }

  firstPlayerAvatar(): Locator {
    return this.rankingRows().first().locator('img, [class*="avatar"]').first();
  }
}
