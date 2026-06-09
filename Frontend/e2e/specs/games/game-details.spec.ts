import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import {
  createGameViaApi,
  createJoinableGame,
  createLeagueSeasonViaApi,
  createResultsEntryFixture,
  deleteGameViaApi,
  findPublicGameId,
  joinGameViaApi,
} from '../../fixtures/games.fixture';
import { GameDetailsPage } from '../../pages/game-details.page';

test.describe('game details', () => {
  test.describe('guest', () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.describe.configure({ mode: 'serial' });

    test('GD-01 guest public view', async ({ page }) => {
      let gameId: string;
      try {
        const { token } = await e2eLogin();
        gameId = (await findPublicGameId(token))!;
      } catch {
        test.skip(true, 'No public game available — seed clubs/city');
        return;
      }

      try {
        const details = new GameDetailsPage(page);
        await details.goto(gameId);
        await details.expectGuestPublicView();
      } finally {
        const { token } = await e2eLogin();
        await deleteGameViaApi(token, gameId);
      }
    });
  });

  test.describe('authenticated @auth @seed:games', () => {
    test.describe.configure({ mode: 'serial' });
    let token: string;
    let userId: string;
    const cleanupIds: string[] = [];

    test.beforeAll(async () => {
      const session = await e2eLogin();
      token = session.token;
      userId = session.user.id;
    });

    test.afterAll(async () => {
      await Promise.all(cleanupIds.map((id) => deleteGameViaApi(token, id)));
    });

    test('GD-08 join open game', async ({ page }) => {
      const { id: gameId } = await createJoinableGame(token, userId);
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.expectJoinCtaVisible();
      await details.clickJoin();
      await details.expectPlayingInGame();
    });

    test('GD-09 leave game', async ({ page }) => {
      const { id: gameId } = await createJoinableGame(token, userId);
      cleanupIds.push(gameId);
      await joinGameViaApi(token, gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.expectPlayingInGame();
      await details.clickLeave();
      await details.confirmLeave();
      await details.expectNotPlaying();
    });

    test('GD-07 open game chat', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openChat();
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}/chat`));
    });

    test('GD-04 share game', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openShareModal();
      await details.expectShareModalWithLink(gameId);
    });

    test('GD-18 carousel vs list participants', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await expect(page.getByTitle(/list view/i)).toBeVisible();
      await details.toggleParticipantsViewMode();
      await details.expectParticipantsListLayout();
      await details.toggleParticipantsViewMode();
      await expect(page.getByTitle(/list view/i)).toBeVisible();
    });

    test('GD-19 edit general info', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);
      const newName = `[E2E] GD-19 ${Date.now()}`;

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openEditGameInfo('general');
      await details.fillGameName(newName);
      await details.saveEditGameInfo();
      await details.expectGameNameVisible(newName);
    });

    test('GD-20 edit when tab', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openEditGameInfo('when');
      await details.expectEditTabVisible('when');
    });

    test('GD-21 edit where tab', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openEditGameInfo('where');
      await details.expectEditTabVisible('where');
    });

    test('GD-22 edit price tab', async ({ page }) => {
      const { id: gameId } = await createGameViaApi(token, userId, { participants: [userId] });
      cleanupIds.push(gameId);

      const details = new GameDetailsPage(page);
      await details.goto(gameId);
      await details.openEditGameInfo('price');
      await details.expectEditTabVisible('price');
      await details.setPriceTypeFree();
      await details.saveEditGameInfo();
    });

    test('GD-28 enter set results', async ({ page }) => {
      const fixture = await createResultsEntryFixture(token, userId);
      cleanupIds.push(fixture.gameId);

      const details = new GameDetailsPage(page);
      await details.goto(fixture.gameId);
      await details.enterFirstSetScore(6, 4);
      await details.expectSetScoreVisible(6, 4);
    });

    test('GD-33 live scoring link', async ({ page }) => {
      const fixture = await createResultsEntryFixture(token, userId);
      cleanupIds.push(fixture.gameId);

      const details = new GameDetailsPage(page);
      await details.goto(fixture.gameId);
      await details.openLiveScoringFromResults(fixture.gameId);
      await expect(page).toHaveURL(new RegExp(`/games/${fixture.gameId}/live`));
    });

    test('GD-43 league tabs', async ({ page }) => {
      const { seasonId } = await createLeagueSeasonViaApi(token);
      cleanupIds.push(seasonId);

      const details = new GameDetailsPage(page);
      await details.goto(seasonId);
      await details.expectLeagueTabsVisible();
    });

    test('GD-44 schedule tab', async ({ page }) => {
      const { seasonId } = await createLeagueSeasonViaApi(token);
      cleanupIds.push(seasonId);

      const details = new GameDetailsPage(page);
      await details.goto(seasonId);
      await details.clickLeagueTab('schedule');
      await details.expectScheduleTabLoaded();
    });

    test('GD-46 standings tab', async ({ page }) => {
      const { seasonId } = await createLeagueSeasonViaApi(token);
      cleanupIds.push(seasonId);

      const details = new GameDetailsPage(page);
      await details.goto(seasonId);
      await details.clickLeagueTab('standings');
      await details.expectStandingsTabLoaded();
    });

    test('GD-47 fullscreen league table', async ({ page }) => {
      const { seasonId } = await createLeagueSeasonViaApi(token);
      cleanupIds.push(seasonId);

      await page.goto(`/games/${seasonId}/league-table`);
      await page.waitForURL(new RegExp(`/games/${seasonId}/league-table`), { timeout: 15_000 });
      await page.getByText(/standing|table|player|team|round/i).first().waitFor({ state: 'visible', timeout: 15_000 });
    });
  });
});
