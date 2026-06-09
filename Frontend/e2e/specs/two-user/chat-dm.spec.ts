import { test, expect } from '@playwright/test';
import { sendUserDmViaApi } from '../../fixtures/api-client';
import { openDualSession } from '../../fixtures/two-user.fixture';
import { ChatsPage } from '../../pages/chats.page';

test.describe('two-user DM @two-user @auth', () => {
  test.describe.configure({ mode: 'serial' });

  test('T2-CH-01 DM receive realtime @dual-browser', async ({ browser }) => {
    const { pageA, pageB, ids, cleanup } = await openDualSession(browser);
    try {
      const chatsB = new ChatsPage(pageB);
      await pageB.goto(`/user-chat/${ids.userAId}`);
      await chatsB.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });

      const text = `e2e T2-CH-01 ${Date.now()}`;
      const chatsA = new ChatsPage(pageA);
      await pageA.goto(`/user-chat/${ids.userBId}`);
      await chatsA.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
      await chatsA.sendTextMessage(text);

      await expect
        .poll(async () => chatsB.messageBubbles().filter({ hasText: text }).isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('T2-CH-02 DM receive hybrid @hybrid', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    try {
      const chatsB = new ChatsPage(pageB);
      await pageB.goto(`/user-chat/${ids.userAId}`);
      await chatsB.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });

      const text = `e2e T2-CH-02 ${Date.now()}`;
      await sendUserDmViaApi(sessions.tokenA, ids.userBId, text);

      await expect
        .poll(async () => chatsB.messageBubbles().filter({ hasText: text }).isVisible(), { timeout: 20_000 })
        .toBe(true);
    } finally {
      await cleanup();
    }
  });

  test('T2-CH-03 inbox preview updates', async ({ browser }) => {
    const { pageB, ids, sessions, cleanup } = await openDualSession(browser);
    try {
      const chatsB = new ChatsPage(pageB);
      await chatsB.gotoInbox();
      await chatsB.waitForInboxLoaded();

      const text = `e2e T2-CH-03 ${Date.now()}`;
      await sendUserDmViaApi(sessions.tokenA, ids.userBId, text);

      await expect.poll(async () => pageB.getByText(text).isVisible(), { timeout: 20_000 }).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
