import { expect, type Locator, type Page } from '@playwright/test';

export type HomeSubtab = 'calendar' | 'past-games';

const SUBTAB_LABEL: Record<HomeSubtab, RegExp> = {
  calendar: /^calendar$/i,
  'past-games': /^past$/i,
};

export class HomePage {
  constructor(private readonly page: Page) {}

  async goto(query = '') {
    await this.page.goto(query ? `/?${query}` : '/');
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
    await this.waitForShell();
  }

  async waitForShell() {
    await this.page.getByRole('tab', { name: /^calendar$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }

  subtab(name: HomeSubtab): Locator {
    return this.page.getByRole('tab', { name: SUBTAB_LABEL[name] });
  }

  async switchSubtab(name: HomeSubtab) {
    await this.subtab(name).click();
    await expect(this.subtab(name)).toHaveAttribute('aria-selected', 'true');
  }

  calendar(): Locator {
    return this.page.locator('[data-calendar="true"]');
  }

  createButton(): Locator {
    return this.page.getByRole('button', { name: /^create$/i });
  }

  createMenuDialog(): Locator {
    return this.page.getByRole('dialog', { name: /^create$/i });
  }

  gameCards(): Locator {
    return this.page.locator('.cursor-pointer.relative.pb-0.overflow-visible');
  }

  storiesRail(): Locator {
    return this.page.getByText(/your story/i).first();
  }

  storyBubbles(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('.rounded-full') });
  }

  emptyMyGamesMessage(): Locator {
    return this.page.getByText(/no games/i);
  }

  markAllReadButton(): Locator {
    return this.page.getByRole('button', { name: /^mark all as read$/i });
  }

  invitesHeading(): Locator {
    return this.page.getByRole('heading', { name: /^invites\b/i });
  }

  async openCreateMenu() {
    await this.page.getByRole('button', { name: /^create$/i }).last().click();
    await expect(this.createMenuDialog()).toBeVisible();
  }

  async selectCreateEntity(label: RegExp) {
    await this.createMenuDialog().getByRole('button', { name: label }).click();
  }

  async waitForMyGamesLoaded() {
    const pattern = (res: { url: () => string; ok: () => boolean }) =>
      res.url().includes('/games/my-games-with-unread') && res.ok();
    const seen = await this.page.waitForResponse(pattern, { timeout: 5_000 }).catch(() => null);
    if (!seen) {
      await this.page.reload();
      await this.waitForShell();
      await this.page.waitForResponse(pattern, { timeout: 30_000 });
    }
  }

  async expectInviteSectionVisible() {
    await this.invitesHeading().waitFor({ state: 'visible', timeout: 20_000 });
  }

  async acceptFirstInvite() {
    await this.expectInviteSectionVisible();
    const accept = this.page.getByRole('button', { name: /^accept$/i }).first();
    const acceptResponse = this.page.waitForResponse(
      (res) => res.url().includes('/invites/') && res.url().includes('/accept') && res.ok(),
      { timeout: 30_000 },
    );
    await accept.click();
    await acceptResponse.catch(() => undefined);
  }

  async declineFirstInvite(note?: string) {
    await this.expectInviteSectionVisible();
    await this.page.getByRole('button', { name: /^decline$/i }).first().click();
    const dialog = this.page.getByRole('dialog').filter({ hasText: /decline invite/i });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    if (note) {
      await dialog.locator('textarea').fill(note);
    }
    const declineResponse = this.page.waitForResponse(
      (res) => res.url().includes('/invites/') && res.url().includes('/decline') && res.ok(),
      { timeout: 30_000 },
    );
    await dialog.getByRole('button', { name: /^decline$/i }).click();
    await declineResponse;
  }

  async openGameCardMatching(text: RegExp | string): Promise<string | null> {
    await this.waitForMyGamesLoaded();
    const card = this.gameCards().filter({ hasText: text }).first();
    if ((await card.count()) === 0) return null;
    await card.click();
    await this.page.waitForURL(/\/games\/[^/]+$/, { timeout: 15_000 });
    const match = this.page.url().match(/\/games\/([^/?#]+)/);
    return match?.[1] ?? null;
  }

  async selectCalendarDay(day: number) {
    const cal = this.calendar();
    await cal.waitFor({ state: 'visible', timeout: 15_000 });
    await cal.getByRole('button', { name: new RegExp(`^${day}$`) }).click();
  }

  async expectGameCardVisible(label: RegExp | string) {
    await expect(this.gameCards().filter({ hasText: label }).first()).toBeVisible({ timeout: 20_000 });
  }

  async openStoryViewerIfAvailable() {
    const bubble = this.page.locator('button').filter({ hasText: /your story/i }).nth(1);
    if ((await bubble.count()) === 0) return false;
    await bubble.click();
    await this.page.locator('[role="dialog"], [data-story-interactive]').first().waitFor({ state: 'visible', timeout: 10_000 });
    return true;
  }

  async openStoryCreateSheet() {
    await this.page.getByText(/your story/i).first().click();
    await this.page.getByRole('dialog').filter({ hasText: /photo|video|story/i }).waitFor({ state: 'visible', timeout: 10_000 });
  }
}
