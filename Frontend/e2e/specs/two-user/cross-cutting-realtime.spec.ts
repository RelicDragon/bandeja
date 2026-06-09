import { test, expect } from '@playwright/test';
import { displayName, sendUserDmViaApi } from '../../fixtures/api-client';
import {
  createJoinableGame,
  deleteGameViaApi,
  joinGameViaApi,
} from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { ChatsPage } from '../../pages/chats.page';
import { GameDetailsPage } from '../../pages/game-details.page';

test.describe('two-user realtime cross-cutting @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-X-01 chat message socket', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    try {
      const chatsB = new ChatsPage(pageB);
      await pageB.goto(`/user-chat/${ids.userAId}`);
      await chatsB.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });

      const text = `e2e T2-X-01 ${Date.now()}`;
      await sendUserDmViaApi(sessions.tokenA, ids.userBId, text);

      await expect
        .poll(async () => chatsB.messageBubbles().filter({ hasText: text }).isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('T2-X-02 game participant join socket', async ({ browser }) => {
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
