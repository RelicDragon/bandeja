import { test, expect, devices } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { createGameViaApi, deleteGameViaApi } from '../../fixtures/games.fixture';
import { HomePage } from '../../pages/home.page';
import { CreateGamePage } from '../../pages/create-game.page';
import { addDays, format, startOfDay } from 'date-fns';

test.use({ ...devices['Pixel 7'] });

test.describe('home calendar @auth', () => {
  test('H-01 calendar shows games', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const label = `[E2E] H-01 ${Date.now()}`;
    const { id: gameId } = await createGameViaApi(token, user.id, { participants: [user.id], name: label });

    try {
      const home = new HomePage(page);
      await home.goto();
      await home.waitForMyGamesLoaded();
      await expect(home.subtab('calendar')).toHaveAttribute('aria-selected', 'true');
      await home.expectGameCardVisible(label);
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('H-02 calendar date select shows games for day', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const target = addDays(startOfDay(new Date()), 2);
    const start = new Date(target);
    start.setHours(14, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    const label = `[E2E] H-02 ${Date.now()}`;
    const { id: gameId } = await createGameViaApi(token, user.id, {
      participants: [user.id],
      name: label,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    try {
      const home = new HomePage(page);
      await home.goto();
      await home.waitForMyGamesLoaded();
      await home.selectCalendarDay(target.getDate());
      await home.expectGameCardVisible(label);
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('H-03 empty my games', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.waitForMyGamesLoaded();
    const cards = home.gameCards();
    if ((await cards.count()) > 0) {
      test.skip(true, 'E2E user has games — needs dedicated empty user');
    }
    await expect(home.emptyMyGamesMessage()).toBeVisible();
  });

  test('H-20 create from calendar date prefills date', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.waitForMyGamesLoaded();
    const tomorrow = addDays(startOfDay(new Date()), 1);
    await home.selectCalendarDay(tomorrow.getDate());
    await home.openCreateMenu();
    await home.selectCreateEntity(/^game$/i);

    const createGame = new CreateGamePage(page);
    await expect(page).toHaveURL(/\/create-game/, { timeout: 15_000 });
    await createGame.expectWizardLoaded('GAME');
    await expect(page.getByText(format(tomorrow, 'dd.MM.yyyy')).or(page.getByText(format(tomorrow, 'd')))).toBeVisible({ timeout: 10_000 });
  });

  test('H-28 past games subtab loads', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto('tab=past-games');
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
    await home.waitForMyGamesLoaded();
    await expect(page).toHaveURL(/\?tab=past-games/);
  });

  test('H-33 subtab survives refresh', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto('tab=past-games');
    await page.reload();
    await home.waitForShell();
    await expect(page).toHaveURL(/\?tab=past-games/);
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
  });

  test('H-34 restore calendar after create', async ({ page }) => {
    const { token } = await e2eLogin();
    const home = new HomePage(page);
    await home.goto();
    await home.openCreateMenu();
    await home.selectCreateEntity(/^game$/i);

    const createGame = new CreateGamePage(page);
    await createGame.pickDefaultTemplateIfShown();
    await createGame.selectFirstClub();
    await createGame.selectFirstAvailableTimeSlot();
    const gameId = await createGame.submitCreate('GAME');

    try {
      await expect(page).toHaveURL(/\/?(\?|$)/);
      await expect(home.subtab('calendar')).toHaveAttribute('aria-selected', 'true');
    } finally {
      if (gameId) await deleteGameViaApi(token, gameId);
    }
  });
});
