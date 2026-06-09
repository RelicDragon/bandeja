import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import {
  createGameViaApi,
  createJoinableGame,
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
  });
});
