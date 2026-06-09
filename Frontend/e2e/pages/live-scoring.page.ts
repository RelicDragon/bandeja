import type { Page } from '@playwright/test';

const SCORE_PATTERN = /^0$|^15$|^30$|^40$|^AD$|^\d+$/i;

export class LiveScoringPage {
  constructor(private readonly page: Page) {}

  async goto(gameId: string, matchId: string, query = '') {
    const q = query ? (query.startsWith('?') ? query : `?${query}`) : `?matchId=${encodeURIComponent(matchId)}`;
    const suffix = q.includes('matchId=') ? q : `?matchId=${encodeURIComponent(matchId)}&${q.replace(/^\?/, '')}`;
    await this.page.goto(`/games/${gameId}/live${suffix}`);
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

  async setupServeForTeamB() {
    await this.page.getByText(/who serves first/i).waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.getByText(/team b|bench b/i).first().click();
    await this.page.getByRole('button', { name: /confirm start/i }).click();
  }

  async expectBoardLoaded() {
    await this.page.getByText('Set 1').waitFor({ state: 'visible', timeout: 20_000 });
    await this.page.getByText('Live').waitFor({ state: 'visible', timeout: 10_000 });
  }

  teamAScoreButton() {
    return this.page.locator('button').filter({ hasText: SCORE_PATTERN }).first();
  }

  teamBScoreButton() {
    return this.page.locator('button').filter({ hasText: SCORE_PATTERN }).nth(1);
  }

  teamAUndoButton() {
    return this.page.getByRole('button', { name: 'Undo' }).first();
  }

  teamBUndoButton() {
    return this.page.getByRole('button', { name: 'Undo' }).nth(1);
  }

  async scorePointForTeamA() {
    await this.teamAScoreButton().click();
  }

  async scorePointForTeamB() {
    await this.teamBScoreButton().click();
  }

  async undoTeamA() {
    await this.teamAUndoButton().click();
  }

  async undoTeamB() {
    await this.teamBUndoButton().click();
  }

  async readTeamAScore(): Promise<string> {
    return this.teamAScoreButton().innerText();
  }

  async readTeamBScore(): Promise<string> {
    return this.teamBScoreButton().innerText();
  }

  async expectMatchCompleteBanner() {
    await this.page.getByText(/match complete|winner|match drawn/i).first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
  }
}
