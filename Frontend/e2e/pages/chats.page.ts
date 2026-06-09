import type { Locator, Page } from '@playwright/test';
import { ShellPage } from './shell.page';

export type ChatsFilter = 'users' | 'channels' | 'market' | 'bugs';

const FILTER_TAB: Record<ChatsFilter, RegExp> = {
  users: /^chats$/i,
  channels: /^channels$/i,
  market: /^market$/i,
  bugs: /^bugs$/i,
};

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

  async gotoBugsInbox() {
    await this.page.goto('/bugs');
    await this.page.waitForURL(/\/bugs\/?(\?|$)/, { timeout: 20_000 });
  }

  async gotoChannelsInbox() {
    await this.page.goto('/chats?filter=channels');
    await this.page.waitForURL(/\/chats\/?(\?.*filter=channels|$)/, { timeout: 20_000 });
  }

  async gotoUserChat(userId: string) {
    await this.page.goto(`/user-chat/${userId}`);
    await this.page.waitForURL(new RegExp(`/user-chat/${userId}`), { timeout: 20_000 });
  }

  async gotoGameChat(gameId: string) {
    await this.page.goto(`/games/${gameId}/chat`);
    await this.page.waitForURL(new RegExp(`/games/${gameId}/chat`), { timeout: 20_000 });
  }

  chatListRows(): Locator {
    return this.page.locator('.cursor-pointer.border-b.border-gray-200, .cursor-pointer.border-b.border-gray-700');
  }

  searchInput(): Locator {
    return this.page.locator('input[type="text"]').first();
  }

  contactsToggle(): Locator {
    return this.page.getByRole('button', { name: /^contacts$/i });
  }

  unreadFilterToggle(): Locator {
    return this.page.getByRole('button', { name: /^filter unread$/i });
  }

  emptyState(): Locator {
    return this.page.getByText(/no conversations yet|no channels yet|no bug reports yet|no chats as buyer|no chats as seller/i);
  }

  contactsEmptyState(): Locator {
    return this.page.getByText(/no users in your city|set your city to see players/i);
  }

  async waitForInboxLoaded() {
    await this.page
      .waitForResponse((res) => res.url().includes('/api/') && res.url().includes('chat') && res.ok(), {
        timeout: 30_000,
      })
      .catch(() => undefined);
    await this.page.locator('.animate-spin').first().waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
  }

  async switchFilter(filter: ChatsFilter) {
    const shell = new ShellPage(this.page);
    await shell.waitForChatsHeader();
    await this.page.locator('header').getByRole('tablist').getByRole('tab', { name: FILTER_TAB[filter] }).click();
    await shell.expectChatsFilter(filter);
  }

  async searchChats(query: string) {
    await this.searchInput().fill(query);
    await this.page.waitForTimeout(400);
  }

  async toggleContactsMode() {
    await this.contactsToggle().click();
  }

  async toggleUnreadFilter() {
    await this.unreadFilterToggle().click();
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

  async startDmFromFirstContact(): Promise<boolean> {
    await this.toggleContactsMode();
    const contact = this.page.locator('.cursor-pointer').filter({ has: this.page.locator('img, [class*="avatar"]') }).first();
    if ((await contact.count()) === 0) return false;
    await contact.click();
    await this.page.waitForURL(/\/user-chat\//, { timeout: 15_000 }).catch(() => undefined);
    return this.page.url().includes('/user-chat/');
  }

  async scrollInboxToEnd() {
    await this.page.evaluate(() => {
      const el = document.querySelector('[class*="overflow-y-auto"], [class*="overflow-auto"]');
      if (el) el.scrollTop = el.scrollHeight;
    });
    await this.page.waitForTimeout(500);
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

  attachButton(): Locator {
    return this.page.getByRole('button', { name: /^attach$/i });
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

  messageBubbleWithText(text: string | RegExp): Locator {
    return this.messageBubbles().filter({ hasText: text });
  }

  gameChatHeaderTitle(): Locator {
    return this.page.locator('header h1, header [class*="font-semibold"]').first();
  }

  async openContextMenuForBubble(bubble: Locator) {
    await bubble.click({ button: 'right' });
    await this.page.getByText(/^reply$|^edit$|^copy$|^delete$/i).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  }

  contextMenuItem(name: RegExp): Locator {
    return this.page.getByRole('button', { name }).or(this.page.locator('button, [role="menuitem"]').filter({ hasText: name }));
  }

  replyPreviewStrip(): Locator {
    return this.page.getByText(/^reply to /i);
  }

  editPreviewStrip(): Locator {
    return this.page.getByText(/^edit message|^editing/i);
  }

  reactionChips(): Locator {
    return this.page.locator('[data-reaction-chip="true"], button[class*="reaction"]');
  }

  quickReactionButton(): Locator {
    return this.page.locator('[data-reaction-button="true"]').first();
  }

  pollQuestion(text: string | RegExp): Locator {
    return this.page.locator('h3').filter({ hasText: text });
  }

  pollOption(text: string | RegExp): Locator {
    return this.page.getByRole('button').filter({ hasText: text });
  }

  messageImages(): Locator {
    return this.page.locator('[data-message-bubble="true"] img, [data-message-bubble="true"] [class*="image"] img');
  }

  async openAttachMenu() {
    await this.attachButton().click();
  }

  async openPollComposer() {
    await this.openAttachMenu();
    await this.page.getByRole('button', { name: /create poll/i }).click();
  }

  async createPoll(question: string, options: [string, string]) {
    await this.openPollComposer();
    await this.page.getByRole('heading', { name: /create poll/i }).waitFor({ state: 'visible' });
    const questionInput = this.page.locator('form input[type="text"]').first();
    await questionInput.fill(question);
    const optionInputs = this.page.locator('form input[type="text"]');
    await optionInputs.nth(1).fill(options[0]);
    await optionInputs.nth(2).fill(options[1]);
    const pollResponse = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && /\/messages/.test(res.url()),
      { timeout: 30_000 },
    );
    await this.page.getByRole('button', { name: /^create poll$/i }).click();
    await pollResponse.catch(() => undefined);
  }

  async stubChatImageUpload() {
    await this.page.route('**/api/media/upload/chat/image**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            originalUrl: 'https://e2e.test/chat-image.png',
            thumbnailUrl: 'https://e2e.test/chat-image-thumb.png',
          },
        }),
      });
    });
  }

  async attachImage(filePath: string) {
    await this.openAttachMenu();
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.page.getByRole('button', { name: /^images$/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  async sendImageMessage(filePath: string) {
    await this.stubChatImageUpload();
    await this.attachImage(filePath);
    const sendResponse = this.page.waitForResponse(
      (res) => res.request().method() === 'POST' && /\/messages/.test(res.url()),
      { timeout: 30_000 },
    );
    await this.sendButton().click();
    await sendResponse.catch(() => undefined);
  }

  async scrollMessagesToTop() {
    await this.page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]'));
      const chat = containers.find((el) => el.querySelector('[data-message-bubble="true"]'));
      if (chat) chat.scrollTop = 0;
    });
    await this.page.waitForTimeout(500);
  }

  inboxRowForPartner(name: string): Locator {
    return this.chatListRows().filter({ has: this.page.getByRole('heading', { name }) });
  }

  unreadBadgeInRow(row: Locator): Locator {
    return row.locator('span.bg-red-500.text-white.rounded-full');
  }

  async isOwnMessageRead(text: string): Promise<boolean> {
    const bubble = this.messageBubbleWithText(text);
    if (!(await bubble.isVisible().catch(() => false))) return false;
    return bubble.locator('[title*="Read"]').isVisible().catch(() => false);
  }

  async openInboxThreadWithPartner(name: string) {
    const row = this.inboxRowForPartner(name);
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    await row.click();
    await this.page.waitForURL(/\/user-chat\//, { timeout: 20_000 });
    await this.messageComposer().waitFor({ state: 'visible', timeout: 30_000 });
  }
}
