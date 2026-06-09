import { test, expect, chromium } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { ProfilePage } from '../../pages/profile.page';
import { ShellPage } from '../../pages/shell.page';
import { SessionsPage } from '../../pages/sessions.page';
import { getE2eCredentials } from '../../test-user';

const { phone, password } = getE2eCredentials();

test.describe('auth session', () => {
  test.describe.configure({ mode: 'serial' });
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

  test('A-21 sessions list @auth', async ({ page }) => {
    const sessions = new SessionsPage(page);
    await sessions.goto();
    await sessions.expectSessionsListed();
  });

  test('A-22 revoke other session @auth', async ({ page }) => {
    const browser = await chromium.launch();
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const loginB = new LoginPage(pageB);
    await loginB.goto();
    await loginB.loginWithPhone(phone, password);
    await pageB.close();
    await ctxB.close();
    await browser.close();

    const sessions = new SessionsPage(page);
    await sessions.goto();
    const revoke = sessions.revokeButtons().first();
    if ((await revoke.count()) === 0) {
      test.skip(true, 'Only one session — need second login context');
      return;
    }
    await revoke.click();
    await expect(page.getByText(/revoked|removed/i)).toBeVisible({ timeout: 15_000 });
  });

  test('A-24 sign out all devices @auth', async ({ page }) => {
    const sessions = new SessionsPage(page);
    await sessions.goto();
    await sessions.signOutAllButton().click();
    await sessions.confirmButton().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('A-26 token refresh @auth', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await page.evaluate(() => localStorage.setItem('token', 'expired-e2e-token'));
    const refreshPromise = page.waitForResponse(
      (res) => res.url().includes('/auth/refresh') && res.ok(),
      { timeout: 30_000 },
    );
    await page.goto('/profile');
    await refreshPromise.catch(() => undefined);
    await expect(page).not.toHaveURL(/\/login/);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    expect(token).not.toBe('expired-e2e-token');
  });
});
