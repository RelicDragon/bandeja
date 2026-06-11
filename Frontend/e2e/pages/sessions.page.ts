import { expect, type Page } from '@playwright/test';

export class SessionsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/profile/sessions');
    await this.page.waitForURL(/\/profile\/sessions/, { timeout: 20_000 });
  }

  pageTitle() {
    return this.page.getByRole('heading', { name: /devices.*sessions|sessions/i });
  }

  currentSessionBadge() {
    return this.page.getByText(/current device|this device|current session/i);
  }

  currentDeviceBadge() {
    return this.currentSessionBadge();
  }

  sessionCards() {
    return this.page.locator('ul li').filter({ has: this.page.getByRole('button', { name: /^revoke$/i }) });
  }

  revokeButtons() {
    return this.page.getByRole('button', { name: /^revoke$/i });
  }

  signOutAllButton() {
    return this.page.getByRole('button', { name: /sign out all|sign out everywhere/i });
  }

  confirmButton() {
    return this.page.getByRole('button', { name: /^confirm$/i });
  }

  async expectSessionsListed() {
    await expect(this.page.getByRole('heading', { name: /sessions|devices/i })).toBeVisible({ timeout: 20_000 });
    await expect(this.currentSessionBadge().or(this.page.getByText(/no active sessions|empty/i))).toBeVisible({
      timeout: 20_000,
    });
  }
}
