import { test } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('shell bootstrap', () => {
  test('G-01 cold load authenticated @auth', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedColdLoad();
  });

  test('G-02 cold load unauthenticated', async ({ page }) => {
    await new ShellPage(page).expectGuestRedirectToLogin();
  });

  test('G-03 unknown route redirects to login', async ({ page }) => {
    await new ShellPage(page).expectUnknownRouteRedirectsLogin();
  });

  test('G-03 unknown route redirects to home @auth', async ({ page }) => {
    await new ShellPage(page).expectUnknownRouteRedirectsHome();
  });
});
