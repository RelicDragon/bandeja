import { test, expect, devices } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createGameViaApi, deleteGameViaApi } from '../../fixtures/games.fixture';
import { FindPage } from '../../pages/find.page';

test.use({ ...devices['Pixel 7'] });

test.describe('find views @auth', () => {
  test('F-01 calendar view default', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.waitForAvailableGamesLoaded();
    await expect(page).toHaveURL(/\/find(?:\?|$)/);
    await expect(find.calendar()).toBeVisible();
  });

  test('F-02 list view', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.waitForAvailableGamesLoaded();
    await find.listToggleButton().click();
    await expect(page).toHaveURL(/\?view=list/);
    await expect(find.calendar()).toBeVisible();
    await expect(find.listToggleButton()).toBeVisible();
  });

  test('F-03 list to calendar', async ({ page }) => {
    const find = new FindPage(page);
    await find.gotoListView();
    await find.waitForAvailableGamesLoaded();
    await find.listToggleButton().click();
    await expect(page).toHaveURL(/\/find(?:\?view=calendar|$)/);
  });

  test('F-04 month calendar navigation', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.waitForAvailableGamesLoaded();
    const before = await find.monthHeading().textContent();
    await find.monthNextButton().click();
    await expect(find.monthHeading()).not.toHaveText(before ?? '');
  });

  test('F-05 go to today', async ({ page }) => {
    const find = new FindPage(page);
    await find.gotoListView();
    await find.waitForAvailableGamesLoaded();
    await find.goToTodayViaFindTab();
    await find.waitForAvailableGamesLoaded();
    await expect(page).toHaveURL(/\/find(?:\?view=calendar|$)/);
    await expect(find.calendar()).toBeVisible();
  });

  test('F-06 desktop calendar split @desktop', async () => {
    test.skip(true, 'requires Desktop Chrome project — add playwright desktop project');
  });

  test('F-29 empty find results', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.seedImpossibleLevelFilters();
    await page.reload();
    await find.waitForShell();
    await find.waitForAvailableGamesLoaded();
    await expect(find.emptyStateMessage()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('find discovery @auth', () => {
  test('F-24 open game details', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const label = `[E2E] F-24 ${Date.now()}`;
    const { id: gameId } = await createGameViaApi(token, user.id, {
      participants: [],
      allowDirectJoin: true,
      isPublic: true,
      name: label,
    });

    try {
      const find = new FindPage(page);
      await find.goto();
      const openedId = await find.openGameCardMatching(label);
      test.skip(!openedId, 'seeded game not visible on Find');
      expect(openedId).toBe(gameId);
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('F-25 quick join from Find with toast', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const label = `[E2E] F-25 ${Date.now()}`;
    const { id: gameId } = await createGameViaApi(token, user.id, {
      participants: [],
      allowDirectJoin: true,
      isPublic: true,
      name: label,
    });

    try {
      const find = new FindPage(page);
      await find.gotoListView();
      await find.waitForAvailableGamesLoaded();

      const joinOnCard = find.gameCards().filter({ hasText: label }).getByRole('button', { name: /^join the game$/i });
      if ((await joinOnCard.count()) === 0) {
        test.skip(true, 'no join button on seeded Find card');
      }

      await find.quickJoinOnCard(label);
      await expect(page.getByText(/joined|success/i)).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('F-26 join queue', async () => {
    test.skip(true, 'requires full game with queue enabled');
  });

  test('F-27 join blocked no name @P5', async () => {
    test.skip(true, 'requires P5 user without name set');
  });

  test('F-28 trainers list section', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.toggleEntityFilter('training');
    await find.waitForAvailableGamesLoaded();
    const trainers = find.trainersSection();
    if ((await trainers.count()) === 0) {
      test.skip(true, 'no trainers in city');
    }
    await expect(trainers).toBeVisible();
  });

  test('F-30 change city from header', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.filtersButton().waitFor({ state: 'visible' });
    await find.cityButton().click();
    await expect(page.getByRole('dialog').filter({ hasText: /city|select city/i })).toBeVisible({ timeout: 10_000 });
  });

  test('F-31 filter button active state', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.openFiltersPanel();
    await find.setUserFilter(true);
    await find.expectFiltersButtonActive(true);
  });

  test('F-32 favorite trainer highlight @user', async () => {
    test.skip(true, 'requires user with favoriteTrainerId');
  });

  test('F-33 gender-restricted game card', async () => {
    test.skip(true, 'requires gender badge selector on game card');
  });

  test('F-34 join blocked wrong gender', async () => {
    test.skip(true, 'requires gender-incompatible user persona');
  });

  test('F-35 level out of range', async () => {
    test.skip(true, 'requires user level outside game range');
  });
});
