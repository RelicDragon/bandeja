import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ChatsPage } from '../../pages/chats.page';
import { e2eLogin, sendUserDmViaApi } from '../../fixtures/api-client';

test.describe.configure({ mode: 'serial' });

test.describe('shell unread badges @auth', () => {
  test('G-29 chats badge clears after opening DM', async ({ page }) => {
    const { user } = await e2eLogin();
    const { token: tokenB } = await e2eLogin('B');
    const marker = `G-29 clear ${Date.now()}`;
    await sendUserDmViaApi(tokenB, user.id, marker);

    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    await expect
      .poll(async () => chats.chatListRows().filter({ hasText: marker }).count(), { timeout: 45_000 })
      .toBeGreaterThan(0);

    const row = chats.chatListRows().filter({ hasText: marker }).first();
    const rowUnreadBadge = row.locator('span.rounded-full.bg-red-500');
    await expect(rowUnreadBadge).toBeVisible({ timeout: 30_000 });

    await row.click();
    await page.waitForURL(/\/user-chat\//, { timeout: 30_000 });
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
    await page
      .waitForResponse((res) => res.url().includes('/read') && res.ok(), { timeout: 20_000 })
      .catch(() => undefined);

    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(rowUnreadBadge).toHaveCount(0, { timeout: 30_000 });
  });

  test('G-11 tab unread badges', async ({ page }) => {
    const { user } = await e2eLogin();
    const { token: tokenB } = await e2eLogin('B');
    await sendUserDmViaApi(tokenB, user.id, `G-11 badge ${Date.now()}`);

    const shell = new ShellPage(page);
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    await expect
      .poll(async () => {
        const subtab = await shell.chatsUsersSubtabBadge().count();
        const bottom = await shell.tabBadge('chats').count();
        return subtab + bottom;
      }, { timeout: 45_000 })
      .toBeGreaterThan(0);
  });
});
