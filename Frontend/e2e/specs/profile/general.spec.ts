import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ProfilePage } from '../../pages/profile.page';

test.describe('profile general @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('PR-01 General tab shows settings', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();

    await expect(page).toHaveURL(/\/profile\/?$/);
    await expect(profile.personalInfoHeading()).toBeVisible({ timeout: 20_000 });
    await expect(profile.firstNameInput()).toBeVisible();
  });

  test('PR-07 Avatar section visible', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();

    const avatar = profile.avatarImage();
    const placeholder = page.locator('.rounded-full').filter({ has: page.locator('svg') }).first();
    await expect(avatar.or(placeholder)).toBeVisible({ timeout: 20_000 });
  });
});
