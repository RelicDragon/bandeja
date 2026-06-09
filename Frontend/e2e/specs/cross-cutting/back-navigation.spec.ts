import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('cross-cutting navigation @auth', () => {
  test('X-27 Back button returns from create-game', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await expect(page).toHaveURL(/\/(\?|$)/);

    await page.goto('/create-game');
    await expect(page).toHaveURL(/\/create-game/);

    await page.goBack();
    await expect(page).not.toHaveURL(/\/create-game/);
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/(find)?$/);
  });
});
