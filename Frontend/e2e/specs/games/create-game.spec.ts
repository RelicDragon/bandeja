import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { deleteGameViaApi } from '../../fixtures/games.fixture';
import { CreateGamePage } from '../../pages/create-game.page';

test.describe('create game @auth', () => {
  test('C-01 invalid create route redirects home', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoInvalidRoute();
    await createGame.expectRedirectedHome();
  });

  test('C-02 create GAME wizard loads', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.expectWizardLoaded();
  });

  test('C-07 bottom tabs hidden on create page', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.expectBottomTabsHidden();
  });

  test('C-08 back navigation returns home', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.clickBack();
    await createGame.expectRedirectedHome();
  });

  test('C-27 submit create completes valid form', async ({ page }) => {
    const { token } = await e2eLogin();
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await createGame.selectFirstAvailableTimeSlot();
    const gameId = await createGame.submitCreate();
    expect(gameId).toBeTruthy();
    try {
      await expect(page).not.toHaveURL(/\/create-game/);
    } finally {
      if (gameId) {
        await deleteGameViaApi(token, gameId);
      }
    }
  });
});
