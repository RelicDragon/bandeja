import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('auth oauth', () => {
  test('A-06 Google OAuth return', async ({ page }) => {
    await page.route('**/api/auth/google/exchange', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            token: 'e2e-google-token',
            refreshToken: 'e2e-google-refresh',
            currentSessionId: 'e2e-session',
            user: {
              id: 'e2e-google-user',
              firstName: 'Google',
              lastName: 'OAuth',
              nameIsSet: true,
              sportsEnabled: ['PADEL'],
              primarySport: 'PADEL',
              primarySportIsSet: true,
              cityIsSet: true,
              language: 'en',
            },
          },
        }),
      });
    });

    await page.goto('/login?google_code=e2e-mock-code');
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('A-07 Google OAuth error', async ({ page }) => {
    await page.goto('/login?google_error=server_error');
    await expect(page.getByText(/google sign-in failed|failed/i)).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
