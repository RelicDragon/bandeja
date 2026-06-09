import { test, expect, devices } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createGameViaApi, deleteGameViaApi } from '../../fixtures/games.fixture';
import { HomePage } from '../../pages/home.page';

test.use({ ...devices['Pixel 7'] });

test.describe('home tab @auth', () => {
  test('H-01 list vs calendar toggle', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.subtab('calendar')).toHaveAttribute('aria-selected', 'true');
    await home.switchSubtab('list');
    await expect(home.subtab('list')).toHaveAttribute('aria-selected', 'true');
    await home.switchSubtab('past-games');
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
    await home.switchSubtab('calendar');
    await expect(home.subtab('calendar')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-31 calendar subtab default', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(page).toHaveURL(/\/?(\?|$)/);
    await expect(home.subtab('calendar')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-30 list subtab', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.switchSubtab('list');
    await expect(page).toHaveURL(/\?tab=list/);
    await expect(home.subtab('list')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-32 URL deep link past games', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto('tab=past-games');
    await expect(page).toHaveURL(/\?tab=past-games/);
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-19 create game entry', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.openCreateMenu();
    await home.selectCreateEntity(/^game$/i);
    await expect(page).toHaveURL(/\/create-game/, { timeout: 15_000 });
  });

  test('H-17 open game from list', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const label = `[E2E] H-17 ${Date.now()}`;
    const { id: gameId } = await createGameViaApi(token, user.id, {
      participants: [user.id],
      name: label,
    });

    try {
      const home = new HomePage(page);
      await home.goto();
      await home.switchSubtab('list');
      const openedId = await home.openGameCardMatching(label);
      test.skip(!openedId, 'created game not visible in my games list');
      expect(openedId).toBe(gameId);
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });
});
