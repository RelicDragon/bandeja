import { test } from '@playwright/test';
import { AppUpdatePage } from '../../pages/app-update.page';
import { ShellPage } from '../../pages/shell.page';
import { injectVersionCheckResult } from '../../fixtures/version-check.fixture';

test.describe('shell app update', () => {
  test('G-04 blocking app update', async ({ page }) => {
    await injectVersionCheckResult(page, {
      status: 'blocking_update',
      minVersion: '99.0.0',
      message: 'E2E blocking update',
    });
    await page.goto('/');
    await new AppUpdatePage(page).expectBlockingUpdate();
  });

  test('G-05 optional app update dismiss @auth', async ({ page }) => {
    await injectVersionCheckResult(page, {
      status: 'optional_update',
      minVersion: '99.0.0',
      message: 'E2E optional update',
    });
    const update = new AppUpdatePage(page);
    const shell = new ShellPage(page);
    await page.goto('/');
    await update.expectOptionalUpdate();
    await update.dismissOptionalUpdate();
    await shell.expectBottomTabsVisible();
  });
});
