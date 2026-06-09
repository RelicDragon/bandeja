import { test, expect } from '@playwright/test';
import { ChatsPage } from '../../pages/chats.page';
import { e2eLogin } from '../../fixtures/api-client';
import { createJoinableGame, deleteGameViaApi, findPublicGameId } from '../../fixtures/games.fixture';
import { ensureUserDm } from '../../fixtures/api-client';

test.describe('shell deep links extended @auth', () => {
  test('G-13 deep link game', async ({ page }) => {
    const { token, user } = await e2eLogin();
    let gameId = await findPublicGameId(token);
    if (!gameId) {
      const created = await createJoinableGame(token, user.id);
      gameId = created.id;
      try {
        await page.goto(`/games/${gameId}`);
        await expect(page).toHaveURL(new RegExp(`/games/${gameId}`));
        await expect(page.getByRole('button', { name: /join|leave|chat/i }).first()).toBeVisible({
          timeout: 20_000,
        });
      } finally {
        await deleteGameViaApi(token, gameId);
      }
      return;
    }
    await page.goto(`/games/${gameId}`);
    await expect(page).toHaveURL(new RegExp(`/games/${gameId}`));
  });

  test('G-14 deep link game chat', async ({ page }) => {
    const { token, user } = await e2eLogin();
    const { id: gameId } = await createJoinableGame(token, user.id);
    try {
      await page.goto(`/games/${gameId}/chat`);
      await expect(page).toHaveURL(new RegExp(`/games/${gameId}/chat`));
      await expect(page.getByPlaceholder(/type a message|message/i)).toBeVisible({ timeout: 20_000 });
    } finally {
      await deleteGameViaApi(token, gameId);
    }
  });

  test('G-15 deep link user chat', async ({ page }) => {
    const { token } = await e2eLogin('A');
    const { userBId } = await import('../../fixtures/api-client').then((m) => m.getE2eUserIds());
    const chatId = await ensureUserDm(token, userBId);
    await page.goto(`/user-chat/${chatId}`);
    await expect(page).toHaveURL(new RegExp(`/user-chat/${chatId}`));
    await expect(page.getByPlaceholder(/type a message/i)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('shell desktop chat @desktop @auth', () => {
  test('G-20 desktop split chat', async ({ page }) => {
    const chats = new ChatsPage(page);
    await chats.gotoInbox();
    await chats.waitForInboxLoaded();
    const opened = await chats.openFirstChat();
    test.skip(!opened, 'No chats in seeded data');

    await expect(chats.chatListRows().first()).toBeVisible();
    await expect(chats.messageComposer().or(page.getByPlaceholder(/type a message/i))).toBeVisible({
      timeout: 20_000,
    });
  });
});
