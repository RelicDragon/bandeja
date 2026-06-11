import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ProfilePage } from '../../pages/profile.page';

test.describe('profile tabs @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('PR-02 Statistics tab shows stats content', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.switchTab('statistics');
    await expect(page).toHaveURL(/\/profile/);
    await expect(
      page.locator('.inline-block.animate-spin, [class*="LevelHistory"], canvas').first(),
    ).toBeVisible({ timeout: 25_000 });
  });

  test('PR-03 Comparison tab shows player picker', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.switchTab('comparison');
    await expect(page.getByText(/select player to compare/i)).toBeVisible({ timeout: 20_000 });
  });

  test('PR-04 Followers tab shows following sections', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.switchTab('followers');
    await expect(page.getByRole('heading', { name: /^following$/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /^followers$/i })).toBeVisible();
  });

  test('PR-06 Reviews tab hidden for non-trainer', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    const tablist = profile.profileTablist();
    const reviewTab = tablist.getByRole('tab', { name: /review/i });
    await expect(reviewTab).toHaveCount(0);
  });
});
