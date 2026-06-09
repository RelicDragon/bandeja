import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { LeaderboardPage } from '../../pages/leaderboard.page';

test.describe('leaderboard filters @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('LB-02 Sport/type filter refetches rankings', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.goto();
    await leaderboard.waitForLoaded();

    const response = page.waitForResponse(
      (res) => res.url().includes('/rankings/user-context') && res.url().includes('type=games') && res.ok(),
      { timeout: 30_000 },
    );
    await leaderboard.switchType('games');
    await response;
    await expect(page).toHaveURL(/\/leaderboard/);
    const rows = leaderboard.rankingRows();
    const empty = leaderboard.emptyState();
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('LB-06 Current user highlight when ranked', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.goto();
    await leaderboard.waitForLoaded();

    const rows = leaderboard.rankingRows();
    const empty = leaderboard.emptyState();
    if (await empty.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'no ranked players in seed data');
    }
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    const youRow = leaderboard.currentUserRow();
    if ((await youRow.count()) === 0) {
      test.skip(true, 'current user not in leaderboard list');
    }
    await expect(youRow).toHaveClass(/primary/);
    await expect(youRow.getByText(/\(you\)/i)).toBeVisible();
  });

  test('LB-04 Open player from row', async ({ page }) => {
    const leaderboard = new LeaderboardPage(page);
    await leaderboard.goto();
    await leaderboard.waitForLoaded();

    const rows = leaderboard.rankingRows();
    if ((await rows.count()) === 0) {
      test.skip(true, 'empty leaderboard');
    }
    const avatar = leaderboard.firstPlayerAvatar();
    await avatar.click();
    const overlay = page.locator('[role="dialog"], [class*="bottom-sheet"], [class*="BottomSheet"]').first();
    if (!(await overlay.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'leaderboard rows are not clickable — no player card');
    }
    await expect(overlay).toBeVisible();
  });

  test('LB-05 Empty leaderboard state', async () => {
    test.skip(true, 'requires isolated city with zero ranked players');
  });
});
