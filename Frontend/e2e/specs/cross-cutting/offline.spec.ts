import { test } from '@playwright/test';
import { OfflinePage } from '../../pages/offline.page';
import { ShellPage } from '../../pages/shell.page';

test.describe('cross-cutting offline @auth', () => {
  test('X-10 Offline gate shows no internet screen', async ({ page, context }) => {
    const shell = new ShellPage(page);
    await shell.expectAuthenticatedHome();
    await shell.clickBottomTab('find');
    await context.setOffline(true);
    await new OfflinePage(page).expectOfflineGate();
    await context.setOffline(false);
  });
});
