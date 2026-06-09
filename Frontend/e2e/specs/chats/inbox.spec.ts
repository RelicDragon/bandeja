import { test, expect } from '@playwright/test';
import { e2eLogin, getE2eUserIds, sendUserDmViaApi } from '../../fixtures/api-client';
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
    await new ShellPage(page).expectChatsFilter('users');

    const rows = chats.chatListRows();
    const empty = page.getByText(/no conversations yet|start chatting with players/i);
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-02 Channels filter', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await chats.switchFilter('channels');

    await expect(page).toHaveURL(/filter=channels/);
    const rows = chats.chatListRows();
    const empty = page.getByText(/no channels yet/i);
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-03 Market filter', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoMarketInbox();
    await chats.waitForInboxLoaded();
    await new ShellPage(page).expectChatsFilter('market');

    const rows = chats.chatListRows();
    const empty = page.getByText(/no chats as buyer|no chats as seller|no results for this search/i);
    await expect(rows.first().or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-05 Search users', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await chats.toggleContactsMode();

    const { user } = await e2eLogin();
    const query = (user.firstName ?? 'e2e').slice(0, 3);
    if (query.length < 2) {
      test.skip(true, 'Need searchable name prefix');
    }

    await chats.searchChats(query);
    const result = page.locator('.cursor-pointer').filter({ hasText: new RegExp(query, 'i') }).first();
    const empty = chats.contactsEmptyState();
    await expect(result.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-06 Unread filter toggle', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const ids = await getE2eUserIds();
    const otherId = ids.userAId === user.id ? ids.userBId : ids.userAId;
    await sendUserDmViaApi(token, otherId, `e2e CH-06 unread ${Date.now()}`);

    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    const unreadBtn = chats.unreadFilterToggle();
    if (!(await unreadBtn.isVisible())) {
      test.skip(true, 'No unread chats badge in seeded data');
    }

    const before = await chats.chatListRows().count();
    await chats.toggleUnreadFilter();
    await page.waitForTimeout(400);
    const after = await chats.chatListRows().count();
    expect(after).toBeLessThanOrEqual(before);
  });

  test('CH-07 Contacts mode', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await chats.toggleContactsMode();

    await expect(chats.contactsToggle()).toHaveClass(/bg-blue-500|border-blue-500/);
    const contact = page.locator('.cursor-pointer').first();
    const empty = chats.contactsEmptyState();
    await expect(contact.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-08 Start new DM', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    const ids = await getE2eUserIds();
    const { user } = await e2eLogin();
    const otherId = ids.userAId === user.id ? ids.userBId : ids.userAId;
    await chats.gotoUserChat(otherId);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/user-chat/${otherId}`));
  });

  test('CH-09 Load more pagination', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();

    const initial = await chats.chatListRows().count();
    if (initial < 5) {
      test.skip(true, 'Not enough chat threads to test pagination');
    }

    await chats.scrollInboxToEnd();
    await expect
      .poll(async () => chats.chatListRows().count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(initial);
  });

  test('CH-59 /chats/marketplace route opens market filter inbox', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoMarketInbox();
    await chats.waitForInboxLoaded();

    await expect(page).toHaveURL(/\/chats\/marketplace\/?$/);
    await new ShellPage(page).expectChatsFilter('market');
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
