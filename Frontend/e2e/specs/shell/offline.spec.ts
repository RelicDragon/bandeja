import { test, expect } from '@playwright/test';
import { OfflinePage } from '../../pages/offline.page';
import { ShellPage } from '../../pages/shell.page';
import { e2eLogin, getE2eUserIds } from '../../fixtures/api-client';
import { findPublicGameId } from '../../fixtures/games.fixture';

test.describe('shell offline', () => {
  test('G-06 offline gate @auth', async ({ page, context }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await context.setOffline(true);
    await page.goto('/find');
    await new OfflinePage(page).expectOfflineGate();
  });

  test('G-07 offline exempt login', async ({ page, context }) => {
    await context.setOffline(true);
    await page.goto('/login');
    await new OfflinePage(page).expectNoOfflineGate();
    await expect(page.getByRole('button', { name: /phone sign-in|telegram/i })).toBeVisible();
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

    await context.setOffline(true);
    await page.goto(`/games/${gameId}`);
    await new OfflinePage(page).expectNoOfflineGate();
  });

  test('G-07 offline exempt user profile @auth', async ({ page, context }) => {
    const { userAId } = await getE2eUserIds();
    await context.setOffline(true);
    await page.goto(`/user-profile/${userAId}`);
    await new OfflinePage(page).expectNoOfflineGate();
  });
});
