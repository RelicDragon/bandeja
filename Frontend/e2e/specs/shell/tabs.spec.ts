import { test } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('shell tabs', () => {
  test('G-10 bottom tab navigation @auth', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.expectAuthenticatedHome();
    await shell.clickAllVisibleBottomTabs();
  });
});
