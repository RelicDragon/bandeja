import { test, expect } from '@playwright/test';
import { inviteUserToGameViaApi } from '../../fixtures/api-client';
import { createGameWithOwnerPlaying, deleteGameViaApi } from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { HomePage } from '../../pages/home.page';
import { GameDetailsPage } from '../../pages/game-details.page';

test.describe('two-user game invites @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-H-01 invite appears on B home', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] T2-H-01 ${Date.now()}`;
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId, label);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const home = new HomePage(pageB);
      await home.goto();
      await home.expectInviteSectionVisible();
      await expect(pageB.getByText(label)).toBeVisible({ timeout: 20_000 });
    } finally {
      await cleanup();
    }
  });

  test('T2-H-02 accept invite', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] T2-H-02 ${Date.now()}`;
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId, label);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));

      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const home = new HomePage(pageB);
      await home.goto();
      await home.acceptFirstInvite();

      const details = new GameDetailsPage(pageB);
      await details.goto(gameId);
      await details.expectPlayingInGame();
    } finally {
      await cleanup();
    }
  });
});
