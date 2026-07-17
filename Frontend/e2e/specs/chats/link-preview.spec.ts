import { test, expect } from '@playwright/test';
import { e2eLogin, getE2eUserIds } from '../../fixtures/api-client';
import { ShellPage } from '../../pages/shell.page';
import { ChatsPage } from '../../pages/chats.page';

test.describe('chat link preview @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  async function openDm(page: import('@playwright/test').Page) {
    const chats = new ChatsPage(page);
    const { user } = await e2eLogin();
    const ids = await getE2eUserIds();
    const otherId = ids.userAId === user.id ? ids.userBId : ids.userAId;
    await chats.gotoUserChat(otherId);
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
    return chats;
  }

  test('CH-130 chip then CH-131 rich card', async ({ page }) => {
    await page.route('**/api/link-preview**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url()).searchParams.get('url') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            url,
            finalUrl: url,
            source: 'external',
            entityType: 'external',
            title: 'E2E Preview Title',
            titleKey: null,
            description: 'E2E description',
            descriptionKey: null,
            imageUrl: null,
            siteName: 'Example',
            hostname: 'example.com',
            badgeKey: null,
            avatarUrl: null,
            sport: null,
            levelLabel: null,
            playerAvatars: [],
            provider: null,
          },
        }),
      });
    });

    const chats = await openDm(page);
    const text = `e2e link preview https://example.com/page-${Date.now()}`;
    await chats.sendTextMessage(text);
    await expect(page.getByTestId('chat-link-preview-chip').or(page.getByTestId('chat-link-preview-card'))).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('chat-link-preview-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-link-preview-card')).toContainText('E2E Preview Title');
  });

  test('CH-139 composer selects and removes a preview without changing text', async ({ page }) => {
    await page.route('**/api/link-preview**', async (route) => {
      const url = new URL(route.request().url()).searchParams.get('url') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            url,
            finalUrl: url,
            source: 'external',
            entityType: 'external',
            title: `Preview ${new URL(url).hostname}`,
            titleKey: null,
            description: 'Composer preview',
            descriptionKey: null,
            imageUrl: null,
            siteName: new URL(url).hostname,
            hostname: new URL(url).hostname,
            badgeKey: null,
            avatarUrl: null,
            sport: null,
            levelLabel: null,
            playerAvatars: [],
            provider: null,
            status: null,
            participantCount: null,
            participantCapacity: null,
            mutable: false,
            refreshedAt: null,
          },
          meta: { outcome: 'ready' },
        }),
      });
    });
    const chats = await openDm(page);
    const text = 'https://example.com/one https://github.com/RelicDragon/bandeja';
    await chats.messageInput().fill(text);
    const composer = page.getByTestId('chat-composer-link-preview');
    await expect(composer).toBeVisible();
    await composer.getByRole('combobox').selectOption('https://github.com/RelicDragon/bandeja');
    await expect(composer).toContainText('github.com');
    await composer.getByRole('button', { name: /remove link preview/i }).click();
    await expect(composer).toHaveCount(0);
    await expect(chats.messageInput()).toHaveValue(text);
  });

  test('CH-140 temporary composer failure retries on user action', async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/link-preview**', async (route) => {
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
        return;
      }
      const url = new URL(route.request().url()).searchParams.get('url') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            url,
            finalUrl: url,
            source: 'external',
            entityType: 'external',
            title: 'Recovered preview',
            titleKey: null,
            description: null,
            descriptionKey: null,
            imageUrl: null,
            siteName: 'Example',
            hostname: 'example.com',
            badgeKey: null,
            avatarUrl: null,
            sport: null,
            levelLabel: null,
            playerAvatars: [],
            provider: null,
            status: null,
            participantCount: null,
            participantCapacity: null,
            mutable: false,
            refreshedAt: null,
          },
          meta: { outcome: 'ready' },
        }),
      });
    });
    const chats = await openDm(page);
    await chats.messageInput().fill(`https://example.com/retry-${Date.now()}`);
    const composer = page.getByTestId('chat-composer-link-preview');
    await composer.getByRole('button', { name: /retry link preview/i }).click();
    await expect(composer).toContainText('Recovered preview');
    await page.waitForTimeout(1_000);
    expect(attempts).toBe(2);
  });

  test('CH-141 sender removes a sent preview without removing URL text', async ({ page }) => {
    await page.route('**/api/link-preview?**', async (route) => {
      const url = new URL(route.request().url()).searchParams.get('url') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            url,
            finalUrl: url,
            source: 'external',
            entityType: 'external',
            title: 'Removable preview',
            titleKey: null,
            description: null,
            descriptionKey: null,
            imageUrl: null,
            siteName: 'Example',
            hostname: 'example.com',
            badgeKey: null,
            avatarUrl: null,
            sport: null,
            levelLabel: null,
            playerAvatars: [],
            provider: null,
            status: null,
            participantCount: null,
            participantCapacity: null,
            mutable: false,
            refreshedAt: null,
          },
          meta: { outcome: 'ready' },
        }),
      });
    });
    const chats = await openDm(page);
    const text = `https://example.com/remove-${Date.now()}`;
    await chats.sendTextMessage(text);
    const card = page.getByTestId('chat-link-preview-card').last();
    await expect(card).toBeVisible();
    const patch = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        /\/messages\/[^/]+\/link-preview$/.test(new URL(response.url()).pathname)
    );
    await card
      .locator('..')
      .getByRole('button', { name: /remove link preview/i })
      .click();
    await patch;
    await expect(card).toHaveCount(0);
    await expect(chats.messageBubbleWithText(text)).toBeVisible();
  });

  test('CH-145 removed composer preview survives draft restore', async ({ page }) => {
    await page.route('**/api/link-preview?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null, meta: { outcome: 'unsupported' } }),
      });
    });
    const chats = await openDm(page);
    const text = `draft https://example.com/draft-${Date.now()}`;
    await chats.messageInput().fill(text);
    const composer = page.getByTestId('chat-composer-link-preview');
    await expect(composer).toBeVisible();
    await composer.getByRole('button', { name: /remove link preview/i }).click();
    await page.waitForTimeout(1_000);
    await page.reload();
    await chats.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
    await expect(chats.messageInput()).toHaveValue(text);
    await expect(page.getByTestId('chat-composer-link-preview')).toHaveCount(0);
  });

  test('CH-133 no preview for giphy', async ({ page }) => {
    const chats = await openDm(page);
    const text = `e2e giphy https://giphy.com/gifs/e2e-${Date.now()}`;
    await chats.sendTextMessage(text);
    await expect(chats.messageBubbleWithText('giphy.com')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-link-preview-chip')).toHaveCount(0);
    await expect(page.getByTestId('chat-link-preview-card')).toHaveCount(0);
  });

  test('CH-136 bandeja deep link card', async ({ page }) => {
    await page.route('**/api/link-preview**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url()).searchParams.get('url') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            url,
            finalUrl: url,
            source: 'bandeja',
            entityType: 'app',
            title: null,
            titleKey: 'app.createGame',
            description: null,
            descriptionKey: 'app.createGame',
            imageUrl: null,
            siteName: 'Bandeja',
            hostname: 'bandeja.me',
            badgeKey: null,
            avatarUrl: null,
            sport: null,
            levelLabel: null,
            playerAvatars: [],
            provider: null,
          },
        }),
      });
    });

    const chats = await openDm(page);
    await chats.sendTextMessage(`https://bandeja.me/create-game?e2e=${Date.now()}`);
    await expect(page.getByTestId('chat-bandeja-link-preview-card')).toBeVisible({ timeout: 20_000 });
  });
});
