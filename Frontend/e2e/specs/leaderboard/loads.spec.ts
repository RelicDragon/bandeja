import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { LeaderboardPage } from '../../pages/leaderboard.page';

test.describe('leaderboard @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('LB-01 Leaderboard loads', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.goto();
    await leaderboard.waitForLoaded();

    await expect(page).toHaveURL(/\/leaderboard\/?$/);
    const rows = leaderboard.rankingRows();
    const empty = leaderboard.emptyState();
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });
});
