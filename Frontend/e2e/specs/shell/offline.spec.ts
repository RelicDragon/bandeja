import { test, expect } from '@playwright/test';
import { OfflinePage } from '../../pages/offline.page';
import { ShellPage } from '../../pages/shell.page';
import { e2eLogin, getE2eUserIds } from '../../fixtures/api-client';
import { findPublicGameId } from '../../fixtures/games.fixture';

test.describe('shell offline', () => {
  test('G-06 offline gate @auth', async ({ page, context }) => {
    const shell = new ShellPage(page);
    await shell.expectAuthenticatedHome();
    await shell.clickBottomTab('find');
    await context.setOffline(true);
    await new OfflinePage(page).expectOfflineGate();
  });

  test('G-07 offline exempt login', async ({ page, context }) => {
    await page.goto('/login');
    const signInEntry = page.getByRole('button', { name: /phone sign-in|telegram/i }).first();
    await expect(signInEntry).toBeVisible();
    await context.setOffline(true);
    await new OfflinePage(page).expectNoOfflineGate();
    await expect(signInEntry).toBeVisible();
  });

  test('G-07 offline exempt game details @auth', async ({ page, context }) => {
    let gameId: string | undefined;
    try {
      const { token } = await e2eLogin();
      gameId = (await findPublicGameId(token)) ?? undefined;
    } catch {
      test.skip(true, 'No public game — seed games');
      return;
    }
    if (!gameId) {
      test.skip(true, 'No public game — seed games');
      return;
    }

    await page.goto(`/games/${gameId}`);
    await page.waitForURL(new RegExp(`/games/${gameId}`), { timeout: 20_000 });
    await context.setOffline(true);
    await new OfflinePage(page).expectNoOfflineGate();
  });

  test('G-07 offline exempt user profile @auth', async ({ page, context }) => {
    const { userAId } = await getE2eUserIds();
    await page.goto(`/user-profile/${userAId}`);
    await page.waitForURL(new RegExp(`/user-profile/${userAId}`), { timeout: 20_000 });
    await context.setOffline(true);
    await new OfflinePage(page).expectNoOfflineGate();
  });
});
