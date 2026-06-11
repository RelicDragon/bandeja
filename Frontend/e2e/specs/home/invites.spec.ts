import { test, expect, devices } from '@playwright/test';
import { inviteUserToGameViaApi } from '../../fixtures/api-client';
import { createGameWithOwnerPlaying, deleteGameViaApi } from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { HomePage } from '../../pages/home.page';
import { GameDetailsPage } from '../../pages/game-details.page';

test.use({ ...devices['Pixel 7'] });

test.describe('home invites @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('H-12 view pending invite', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] H-12 ${Date.now()}`;
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId, label);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));
      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const home = new HomePage(pageB);
      await home.goto();
      await home.expectInviteSectionVisible();
      await expect(pageB.getByRole('heading', { name: label }).or(pageB.getByText(label).first())).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await cleanup();
    }
  });

  test('H-13 accept invite', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] H-13 ${Date.now()}`;
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
      await expect(pageB.getByText(label)).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test('H-14 decline invite with modal', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] H-14 ${Date.now()}`;
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId, label);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));
      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const home = new HomePage(pageB);
      await home.goto();
      await home.expectInviteSectionVisible();
      await home.declineFirstInvite();
      await expect(pageB.getByText(label)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  test('H-15 decline with note', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const label = `[E2E] H-15 ${Date.now()}`;
      const note = `e2e decline note ${Date.now()}`;
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId, label);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));
      await inviteUserToGameViaApi(sessions.tokenA, gameId, ids.userBId);

      const home = new HomePage(pageB);
      await home.goto();
      await home.declineFirstInvite(note);
      await expect(pageB.getByText(label)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });

  test('H-16 invite note on game without accept', async () => {
    test.skip(true, 'GameCard invite note UI requires stable note-save selector');
  });
});
