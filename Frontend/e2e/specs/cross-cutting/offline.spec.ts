import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('cross-cutting offline @auth', () => {
  test('X-10 Offline gate shows no internet screen', async ({ page, context }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await page.goto('/find');
    await context.setOffline(true);
    await expect(page.getByText(/no internet connection/i)).toBeVisible({ timeout: 20_000 });
    await context.setOffline(false);
  });
});
