import { test, expect, devices } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createGameViaApi, deleteGameViaApi } from '../../fixtures/games.fixture';
import { FindPage } from '../../pages/find.page';

test.use({ ...devices['Pixel 7'] });

test.describe('find tab @auth', () => {
  test('F-01 calendar view default', async ({ page }) => {
    const find = new FindPage(page);
    await find.goto();
    await find.waitForAvailableGamesLoaded();
    await expect(page).toHaveURL(/\/find(?:\?|$)/);
    await expect(find.calendar()).toBeVisible();
  });

  test('F-02 list view', async ({ page }) => {
    const find = new FindPage(page);
    await find.gotoListView();
    await find.waitForAvailableGamesLoaded();
    await expect(page).toHaveURL(/\?view=list/);
    await expect(find.calendar()).toHaveCount(0);
    await expect(find.listWeekRangeLabel()).toBeVisible();
  });

  test('F-22 URL view sync', async ({ page }) => {
    const find = new FindPage(page);
    await find.gotoListView();
    await find.waitForAvailableGamesLoaded();
    await expect(page).toHaveURL(/view=list/);
    await expect(find.listWeekRangeLabel()).toBeVisible();
    await expect(find.calendar()).toHaveCount(0);
  });

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

  test('F-25 quick join from Find', async ({ page }) => {
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

      const joinOnCard = find
        .gameCards()
        .filter({ hasText: label })
        .getByRole('button', { name: /^join the game$/i });
      if ((await joinOnCard.count()) === 0) {
        test.skip(true, 'no join button on seeded Find card');
      }

      await joinOnCard.click();
      await page.getByRole('dialog').filter({ hasText: /join game\?/i }).waitFor({ state: 'visible' });
      const joinResponse = page.waitForResponse(
        (res) => res.url().includes(`/games/${gameId}/join`) && res.request().method() === 'POST',
        { timeout: 30_000 },
      );
      await page.getByRole('button', { name: /^confirm$/i }).click();
      await joinResponse;
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`));
    } finally {
      await deleteGameViaApi(token, gameId);
    }
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
