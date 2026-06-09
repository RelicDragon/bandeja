import { test, expect, devices } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createGameViaApi, deleteGameViaApi } from '../../fixtures/games.fixture';
import { CreateGamePage } from '../../pages/create-game.page';
import { GameDetailsPage } from '../../pages/game-details.page';
import { ProfilePage } from '../../pages/profile.page';

test.describe('cross-cutting shell @auth', () => {
  test('X-31 Bottom tabs hidden on create-game', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.expectBottomTabsHidden();
  });

});

test.describe('cross-cutting shell mobile @auth', () => {
  test.use({ ...devices['Pixel 5'] });

  test('X-32 Game details hides tabs on mobile', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const { id: gameId } = await createGameViaApi(token, user.id, { participants: [user.id] });

    try {
      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await expect(page.getByRole('button', { name: /^chats$/i })).toBeHidden({ timeout: 10_000 });
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });
});

test.describe('cross-cutting city UI @auth', () => {
  test('X-18 City selector list opens from profile', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.changeCityButton().scrollIntoViewIfNeeded();
    await profile.changeCityButton().click();
    await expect(page.getByRole('dialog').or(page.locator('[class*="CityList"]'))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/search/i).or(page.locator('input[type="search"]'))).toBeVisible({ timeout: 10_000 });
  });
});
