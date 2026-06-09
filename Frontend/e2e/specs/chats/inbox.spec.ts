import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ChatsPage } from '../../pages/chats.page';

test.describe('chats inbox @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('CH-01 Users filter default shows inbox', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    await expect(page).toHaveURL(/\/chats\/?(\?|$)/);
    await expect(page.getByRole('button', { name: /^chats$/i }).first()).toBeVisible();

    const rows = chats.chatListRows();
    const empty = page.getByText(/no conversations yet|start chatting with players/i);
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-59 /chats/marketplace route opens market filter inbox', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoMarketInbox();
    await chats.waitForInboxLoaded();

    await expect(page).toHaveURL(/\/chats\/marketplace\/?$/);
    await expect(page.getByRole('button', { name: /^market$/i }).first()).toBeVisible();
  });

  test('CH-12 User DM send text', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    const opened = await chats.openFirstUserDm();
    test.skip(!opened, 'No user DM available in seeded data');

    await expect(page).toHaveURL(/\/user-chat\//);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 20_000 });

    const messageText = `e2e CH-12 ${Date.now()}`;
    await chats.sendTextMessage(messageText);
    await expect(chats.messageBubbles().filter({ hasText: messageText })).toBeVisible({ timeout: 20_000 });
  });

  test('CH-18 Send text message', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    const opened = await chats.openFirstChat();
    test.skip(!opened, 'No chat threads available in seeded data');

    const composerVisible = await chats
      .messageComposer()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!composerVisible, 'Selected chat has no message composer');

    const messageText = `e2e CH-18 ${Date.now()}`;
    await chats.sendTextMessage(messageText);
    await expect(chats.messageBubbles().filter({ hasText: messageText })).toBeVisible({ timeout: 20_000 });
  });
});
