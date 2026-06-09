import type { Page } from '@playwright/test';

export class GameDetailsPage {
  constructor(private readonly page: Page) {}

  async goto(gameId: string) {
    await this.page.goto(`/games/${gameId}`);
    if (await this.page.getByText(/something went wrong/i).isVisible({ timeout: 3_000 }).catch(() => false)) {
      await this.page.reload();
    }
    await this.page.waitForURL(new RegExp(`/games/${gameId}`), { timeout: 20_000 });
  }

  async expectGuestPublicView() {
    await this.page.getByText(/join to participate!|login or register to join/i).waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.getByRole('button', { name: /^login$/i }).waitFor({ state: 'visible' });
  }

  async expectJoinCtaVisible() {
    await this.page
      .getByRole('button', { name: /join the game|play in a game|play in the game|join the queue/i })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickJoin() {
    const joinResponse = this.page.waitForResponse(
      (res) =>
        (res.url().includes('/join') || res.url().includes('/toggle-playing-status')) &&
        res.request().method() !== 'GET',
      { timeout: 20_000 },
    );
    await this.page
      .getByRole('button', { name: /join the game|play in a game|play in the game/i })
      .first()
      .click();
    await joinResponse;
  }

  async expectPlayingInGame() {
    await this.page
      .locator('button')
      .filter({ hasText: /^leave$|^don't play$/i })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickLeave() {
    const dontPlay = this.page.getByRole('button', { name: /^don't play$/i });
    if (await dontPlay.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dontPlay.click();
      return;
    }
    await this.page.getByRole('button', { name: /^leave$/i }).click();
  }

  async confirmLeave() {
    const dialog = this.page.getByRole('dialog');
    if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dialog.getByRole('button', { name: /^leave$/i }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
    }
  }

  async expectNotPlaying() {
    await this.page
      .getByRole('button', { name: /join the game|play in a game/i })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async openChat() {
    await this.page.getByRole('button', { name: /^chat$/i }).click();
    await this.page.waitForURL(/\/chat/, { timeout: 15_000 });
  }

  async expectParticipantNameVisible(name: string) {
    await this.page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 20_000 });
  }
}
