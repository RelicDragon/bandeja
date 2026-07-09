import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { deleteGameViaApi } from '../../fixtures/games.fixture';
import { CreateGamePage } from '../../pages/create-game.page';

test.describe('create game entry @auth', () => {
  test('C-01 invalid create route redirects home', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoInvalidRoute();
    await createGame.expectRedirectedHome();
  });

  test('C-02 create GAME wizard loads', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.expectWizardLoaded('GAME');
  });

  test('C-03 create BAR fields', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('BAR');
    await createGame.expectWizardLoaded('BAR');
    await createGame.expectBarSpecificFields();
  });

  test('C-04 create TRAINING fields', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('TRAINING');
    await createGame.expectWizardLoaded('TRAINING');
    await createGame.expectTrainingSpecificFields();
  });

  test('C-05 create TOURNAMENT fields', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('TOURNAMENT');
    await createGame.expectWizardLoaded('TOURNAMENT');
    await createGame.expectTournamentSpecificFields();
  });

  test('C-06 duplicate game from details', async () => {
    test.skip(true, 'requires navigate from game details duplicate action');
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
    const gameId = await createGame.submitCreate('GAME');
    expect(gameId).toBeTruthy();
    try {
      await expect(page).not.toHaveURL(/\/create-game/);
    } finally {
      if (gameId) {
        await deleteGameViaApi(token, gameId);
      }
    }
  });

  test('C-28 validation errors on incomplete submit', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.submitExpectBlocked('GAME');
  });

  test('C-14u create validation toast with integrated club', async ({ page }) => {
    const createGame = new CreateGamePage(page);
    await createGame.gotoWithEntityType('GAME');
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    const intentVisible = await page
      .getByText(/court reservation/i)
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    test.skip(!intentVisible, 'No BOOKTIME-integrated club in test city');
    await createGame.submitExpectValidationToast(/court|time|duration|reservation|bookable/i);
  });
});
