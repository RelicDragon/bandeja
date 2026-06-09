import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ProfilePage } from '../../pages/profile.page';
import { LeaderboardPage } from '../../pages/leaderboard.page';

test.describe('cross-cutting accessibility @auth', () => {
  test('X-15 Bottom tab labels visible when inactive', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await expect(page.getByRole('button', { name: /^find$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^chats$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^market$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^top$/i })).toBeVisible();
  });

  test('X-17 Profile and leaderboard load without crash', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.switchTab('statistics');
    await expect(page.locator('body')).not.toContainText(/something went wrong/i);

    const leaderboard = new LeaderboardPage(page);
    await leaderboard.goto();
    await leaderboard.waitForLoaded();
    await expect(page.locator('body')).not.toContainText(/something went wrong/i);
  });
});
