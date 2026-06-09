import type { Page } from '@playwright/test';

const SCORE_PATTERN = /^0$|^15$|^30$|^40$|^AD$|^\d+$/i;

export class LiveScoringPage {
  constructor(private readonly page: Page) {}

  async goto(gameId: string, matchId: string) {
    await this.page.goto(`/games/${gameId}/live?matchId=${encodeURIComponent(matchId)}`);
    await this.page.waitForURL(new RegExp(`/games/${gameId}/live`), { timeout: 20_000 });
  }

  async dismissServeSetupIfPresent() {
    const skip = this.page.getByRole('button', { name: /hide serve guide/i });
    if (await skip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await skip.click();
    }
    const confirmStart = this.page.getByRole('button', { name: /confirm start|start match/i });
    if (await confirmStart.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await confirmStart.click();
    }
  }

  async expectBoardLoaded() {
    await this.page.getByText('Set 1').waitFor({ state: 'visible', timeout: 20_000 });
    await this.page.getByText('Live').waitFor({ state: 'visible', timeout: 10_000 });
  }

  teamAScoreButton() {
    return this.page.locator('button').filter({ hasText: SCORE_PATTERN }).first();
  }

  teamAUndoButton() {
    return this.page.getByRole('button', { name: 'Undo' }).first();
  }

  async scorePointForTeamA() {
    await this.teamAScoreButton().click();
  }

  async undoTeamA() {
    await this.teamAUndoButton().click();
  }

  async readTeamAScore(): Promise<string> {
    return this.teamAScoreButton().innerText();
  }
}
