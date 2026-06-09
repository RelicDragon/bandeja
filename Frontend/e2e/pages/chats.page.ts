import type { Locator, Page } from '@playwright/test';

export class ChatsPage {
  constructor(private readonly page: Page) {}

  async gotoInbox() {
    await this.page.goto('/chats');
    await this.page.waitForURL((url) => url.pathname === '/chats' || url.pathname === '/chats/', { timeout: 20_000 });
  }

  async gotoMarketInbox() {
    await this.page.goto('/chats/marketplace');
    await this.page.waitForURL(/\/chats\/marketplace\/?$/, { timeout: 20_000 });
  }

  chatListRows(): Locator {
    return this.page.locator('.cursor-pointer.border-b.border-gray-200, .cursor-pointer.border-b.border-gray-700');
  }

  async waitForInboxLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/api/') && res.url().includes('chat') && res.ok(),
      { timeout: 30_000 },
    ).catch(() => undefined);
    await this.page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  }

  async openFirstChat(): Promise<boolean> {
    const rows = this.chatListRows();
    const count = await rows.count();
    if (count === 0) return false;
    await rows.first().click();
    return true;
  }

  async openFirstUserDm(): Promise<boolean> {
    const rows = this.chatListRows();
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      await rows.nth(i).click();
      await this.page.waitForTimeout(300);
      if (this.page.url().includes('/user-chat/')) return true;
    }
    return false;
  }

  messageComposer(): Locator {
    return this.page.locator('[data-cap-chat-composer]');
  }

  messageInput(): Locator {
    return this.page.getByPlaceholder(/type a message/i);
  }

  sendButton(): Locator {
    return this.page.getByRole('button', { name: /^send message$/i });
  }

  async sendTextMessage(text: string) {
    await this.messageInput().waitFor({ state: 'visible', timeout: 20_000 });
    await this.messageInput().fill(text);
    const sendResponse = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && /\/messages/.test(res.url()),
      { timeout: 30_000 },
    );
    await this.sendButton().click();
    await sendResponse.catch(() => undefined);
  }

  messageBubbles(): Locator {
    return this.page.locator('[data-message-bubble="true"]');
  }
}
