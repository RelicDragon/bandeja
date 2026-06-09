import { test, expect } from '@playwright/test';
import { displayName } from '../../fixtures/api-client';
import {
  createJoinableGame,
  deleteGameViaApi,
  joinGameViaApi,
} from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { GameDetailsPage } from '../../pages/game-details.page';

test.describe('two-user game join @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-GD-01 join updates owner UI @dual-browser', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createJoinableGame(sessions.tokenA, ids.userAId);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const detailsA = new GameDetailsPage(pageA);
      await detailsA.goto(gameId);

      await joinGameViaApi(sessions.tokenB, gameId);

      const bName = displayName(sessions.userB);
      await expect.poll(async () => {
        try {
          await detailsA.expectParticipantNameVisible(bName);
          return true;
        } catch {
          return false;
        }
      }, { timeout: 20_000 }).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('T2-GD-03 hybrid join updates roster @hybrid', async ({ browser }) => {
    const { pageA, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createJoinableGame(sessions.tokenA, ids.userAId);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      const detailsA = new GameDetailsPage(pageA);
      await detailsA.goto(gameId);
      await joinGameViaApi(sessions.tokenB, gameId);

      const bName = displayName(sessions.userB);
      await expect.poll(async () => {
        try {
          await detailsA.expectParticipantNameVisible(bName);
          return true;
        } catch {
          return false;
        }
      }, { timeout: 20_000 }).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
