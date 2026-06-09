import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { e2eLogin, getE2eUserIds, sendUserDmViaApi } from '../../fixtures/api-client';
import { createJoinableGame, deleteGameViaApi } from '../../fixtures/games.fixture';

test.describe('shell unread badges @auth', () => {
  test('G-11 tab unread badges', async ({ page }) => {
    const { token, user } = await e2eLogin('B');
    const { userAId } = await getE2eUserIds();

    await sendUserDmViaApi(token, userAId, `G-11 badge ${Date.now()}`);

    const { id: gameId } = await createJoinableGame(token, user.id);
    try {
      await page.goto('/');
      const shell = new ShellPage(page);
      await shell.waitForShellReady();

      await expect
        .poll(async () => {
          const chatsBadge = shell.tabBadge('chats');
          const myBadge = shell.tabBadge('my');
          return (await chatsBadge.count()) + (await myBadge.count());
        }, { timeout: 30_000 })
        .toBeGreaterThan(0);
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });
});
