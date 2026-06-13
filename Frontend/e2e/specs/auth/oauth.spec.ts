import { test, expect } from '@playwright/test';
import { e2eGetProfile, e2eLogin } from '../../fixtures/api-client';
import { ShellPage } from '../../pages/shell.page';

test.describe('auth oauth', () => {
  test('A-06 Google OAuth return', async ({ page }) => {
    const { token, user, refreshToken, currentSessionId } = await e2eLogin();
    const profile = await e2eGetProfile(token).catch(() => user);

    await page.route('**/api/auth/google/exchange**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            token,
            refreshToken,
            currentSessionId,
            user: profile,
          },
        }),
      });
    });

    await page.goto('/login?google_code=e2e-mock-code');
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '');
    await new ShellPage(page).expectBottomTabsVisible();
  });

  test('A-07 Google OAuth error', async ({ page }) => {
    await page.goto('/login?google_error=server_error');
    await expect(page.getByText(/google sign-in failed|failed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
