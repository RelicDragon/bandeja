import { test, expect } from '@playwright/test';
import { e2eApi } from '../../fixtures/api-client';
import { createGameWithOwnerPlaying, deleteGameViaApi, joinGameViaApi } from '../../fixtures/games.fixture';
import { registerTeardown, openDualSession } from '../../fixtures/two-user.fixture';
import { ChatsPage } from '../../pages/chats.page';

test.describe('two-user game chat @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-CH-10 game chat receive', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    let gameId = '';
    try {
      const created = await createGameWithOwnerPlaying(sessions.tokenA, ids.userAId);
      gameId = created.id;
      registerTeardown(() => deleteGameViaApi(sessions.tokenA, gameId));
      await joinGameViaApi(sessions.tokenB, gameId);

      await pageB.goto(`/games/${gameId}/chat`);
      const chatsB = new ChatsPage(pageB);
      await chatsB.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });

      const text = `e2e T2-CH-10 ${Date.now()}`;
      await e2eApi(sessions.tokenA, '/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          contextId: gameId,
          chatContextType: 'GAME',
          chatType: 'PUBLIC',
          content: text,
        }),
      });

      await expect
        .poll(async () => chatsB.messageBubbles().filter({ hasText: text }).isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });
});
