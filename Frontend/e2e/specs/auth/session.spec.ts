import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { ProfilePage } from '../../pages/profile.page';
import { ShellPage } from '../../pages/shell.page';
import { getE2eCredentials } from '../../test-user';

const { phone, password } = getE2eCredentials();

test.describe('auth session', () => {
  test('A-20 logout from profile @auth', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.goto();
    await profile.logout();
    await profile.expectSessionCleared();
  });

  test('A-25 session persistence', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginWithPhone(phone, password);
    await new ShellPage(page).expectAuthenticatedHome();

    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
    await new ShellPage(page).expectBottomTabsVisible();
  });
});
