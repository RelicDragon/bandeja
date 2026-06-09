import { test, expect } from '@playwright/test';
import { createGameWithOwnerPlaying, deleteGameViaApi, joinGameViaApi } from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { ChatsPage } from '../../pages/chats.page';

test.describe('two-user game chat @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-CH-10 game chat receive @dual-browser', async ({ browser }) => {
    const { pageA, pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));
      await joinGameViaApi(sessions.tokenB, gameId);

      const chatsA = new ChatsPage(pageA);
      const chatsB = new ChatsPage(pageB);
      await Promise.all([
        pageA.goto(`/games/${gameId}/chat`).then(() =>
          chatsA.messageComposer().waitFor({ state: 'visible', timeout: 30_000 }),
        ),
        pageB.goto(`/games/${gameId}/chat`).then(() =>
          chatsB.messageComposer().waitFor({ state: 'visible', timeout: 30_000 }),
        ),
      ]);

      const text = `e2e T2-CH-10 ${Date.now()}`;
      await chatsA.sendTextMessage(text);

      await expect
        .poll(async () => chatsB.messageBubbles().filter({ hasText: text }).isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });
});
