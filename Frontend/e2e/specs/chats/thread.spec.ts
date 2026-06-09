import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { e2eLogin, ensureUserDm, getE2eUserIds } from '../../fixtures/api-client';
import { createGameWithOwnerPlaying, deleteGameViaApi, joinGameViaApi } from '../../fixtures/games.fixture';
import { ShellPage } from '../../pages/shell.page';
import { ChatsPage } from '../../pages/chats.page';

const e2eRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const testImage = path.join(e2eRoot, 'fixtures', 'assets', 'e2e-1x1.png');

test.describe('chat thread messaging @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  async function openDmThread(page: import('@playwright/test').Page) {
    const chats = new ChatsPage(page);
    const { user } = await e2eLogin();
    const ids = await getE2eUserIds();
    const otherId = ids.userAId === user.id ? ids.userBId : ids.userAId;
    await chats.gotoUserChat(otherId);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
    return { chats, otherId };
  }

  test('CH-19 Send emoji', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const messageText = `e2e CH-19 😀 ${Date.now()}`;
    await chats.sendTextMessage(messageText);
    await expect(chats.messageBubbleWithText('😀')).toBeVisible({ timeout: 20_000 });
  });

  test('CH-20 Reply to message', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const original = `e2e CH-20 original ${Date.now()}`;
    await chats.sendTextMessage(original);
    const bubble = chats.messageBubbleWithText(original);
    await bubble.waitFor({ state: 'visible', timeout: 20_000 });
    await chats.openContextMenuForBubble(bubble);
    await chats.contextMenuItem(/^reply$/i).click();
    await expect(chats.replyPreviewStrip()).toBeVisible();
    const replyText = `e2e CH-20 reply ${Date.now()}`;
    await chats.sendTextMessage(replyText);
    await expect(chats.messageBubbleWithText(replyText)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-21 Edit message', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const original = `e2e CH-21 before ${Date.now()}`;
    await chats.sendTextMessage(original);
    const bubble = chats.messageBubbleWithText(original);
    await bubble.waitFor({ state: 'visible', timeout: 20_000 });
    await chats.openContextMenuForBubble(bubble);
    await chats.contextMenuItem(/^edit$/i).click();
    await expect(chats.editPreviewStrip()).toBeVisible();
    const edited = `e2e CH-21 after ${Date.now()}`;
    await chats.messageInput().fill(edited);
    await chats.sendButton().click();
    await expect(chats.messageBubbleWithText(edited)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-22 Delete message', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const text = `e2e CH-22 delete ${Date.now()}`;
    await chats.sendTextMessage(text);
    const bubble = chats.messageBubbleWithText(text);
    await bubble.waitFor({ state: 'visible', timeout: 20_000 });
    await chats.openContextMenuForBubble(bubble);
    await chats.contextMenuItem(/^delete$/i).click();
    await expect(chats.messageBubbleWithText(text)).toHaveCount(0, { timeout: 20_000 });
  });

  test('CH-23 Reaction', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const text = `e2e CH-23 react ${Date.now()}`;
    await chats.sendTextMessage(text);
    const bubble = chats.messageBubbleWithText(text);
    await bubble.waitFor({ state: 'visible', timeout: 20_000 });
    await chats.openContextMenuForBubble(bubble);
    await page.locator('button').filter({ hasText: '👍' }).first().click();
    await expect(page.locator('button, span').filter({ hasText: '👍' }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('CH-28 Send image', async ({ page }) => {
    const { chats } = await openDmThread(page);
    await chats.sendImageMessage(testImage);
    await expect(chats.messageImages().first()).toBeVisible({ timeout: 20_000 });
  });

  test('CH-32 Create poll', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const question = `e2e CH-32 ${Date.now()}`;
    await chats.createPoll(question, ['Yes', 'No']);
    await expect(chats.pollQuestion(question)).toBeVisible({ timeout: 20_000 });
  });

  test('CH-33 Vote on poll', async ({ page }) => {
    const { chats } = await openDmThread(page);
    const question = `e2e CH-33 ${Date.now()}`;
    await chats.createPoll(question, ['Alpha', 'Beta']);
    await chats.pollQuestion(question).waitFor({ state: 'visible', timeout: 20_000 });
    await chats.pollOption('Alpha').click();
    await expect(chats.pollOption('Alpha')).toHaveClass(/selected|emerald|blue|border/, { timeout: 15_000 }).catch(async () => {
      await expect(page.getByText(/1 vote|100%/i).first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test('CH-36 Draft persistence', async ({ page }) => {
    const { chats, otherId } = await openDmThread(page);
    const draft = `e2e CH-36 draft ${Date.now()}`;
    await chats.messageInput().fill(draft);
    await page.waitForTimeout(1200);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await chats.gotoUserChat(otherId);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 20_000 });
    await expect(chats.messageInput()).toHaveValue(draft, { timeout: 15_000 });
  });

  test('CH-39 Read receipts clear unread', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const ids = await getE2eUserIds();
    const otherId = ids.userAId === user.id ? ids.userBId : ids.userAId;
    const chatId = await ensureUserDm(token, otherId);

    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    await chats.gotoUserChat(otherId);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForResponse((res) => res.url().includes('/read') && res.ok(), { timeout: 20_000 }).catch(() => undefined);
    void chatId;
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    const unreadBtn = chats.unreadFilterToggle();
    if (await unreadBtn.isVisible()) {
      await chats.toggleUnreadFilter();
      await expect(chats.chatListRows().filter({ hasText: otherId })).toHaveCount(0);
    }
  });
});

test.describe('game chat thread @auth', () => {
  test('CH-13 Game chat context header', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    const { token, user } = await e2eLogin();
    const gameName = `[E2E] CH-13 ${Date.now()}`;
    const { id: gameId } = await createGameWithOwnerPlaying(token, user.id, gameName);
    try {
      await joinGameViaApi(token, gameId).catch(() => undefined);
      const chats = new ChatsPage(page);
      await chats.gotoGameChat(gameId);
      await chats.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
      await expect(page.getByText(gameName).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });
});
