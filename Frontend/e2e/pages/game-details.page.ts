import { expect, type Page } from '@playwright/test';

export type EditGameInfoTab = 'general' | 'when' | 'where' | 'price';
export type LeagueSeasonTab = 'general' | 'schedule' | 'planner' | 'standings' | 'faq';

export class GameDetailsPage {
  constructor(private readonly page: Page) {}

  async goto(gameId: string, query = '') {
    await this.page.goto(`/games/${gameId}${query}`);
    if (await this.page.getByText(/something went wrong/i).isVisible({ timeout: 3_000 }).catch(() => false)) {
      await this.page.reload();
    }
    await this.page.waitForURL(new RegExp(`/games/${gameId}`), { timeout: 20_000 });
  }

  async expectGuestPublicView() {
    await this.page.getByRole('heading', { name: /join to participate/i }).waitFor({ state: 'visible', timeout: 15_000 });
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
      .getByRole('button', { name: /join the game|play in a game|play in the game|join the queue/i })
      .first()
      .click();
    await joinResponse;
  }

  async clickJoinQueue() {
    const joinResponse = this.page.waitForResponse(
      (res) => res.url().includes('/join') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await this.page.getByRole('button', { name: /join the queue/i }).click();
    await joinResponse;
  }

  async expectInJoinQueue() {
    await this.page
      .getByText(/waiting list|waiting for approval|in the waiting list/i)
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickCancelJoinQueue() {
    await this.page.getByRole('button', { name: /cancel request/i }).click();
  }

  async expectNotInJoinQueue() {
    await this.page
      .getByRole('button', { name: /join the queue/i })
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async acceptFirstJoinQueueUser() {
    const section = this.page.locator('text=Join Queue').locator('..');
    await section.getByTitle(/^accept$/i).first().click();
  }

  async declineFirstJoinQueueUser() {
    const section = this.page.locator('text=Join Queue').locator('..');
    await section.getByTitle(/^decline$/i).first().click();
  }

  async expectJoinQueueUserVisible(name: string) {
    await this.page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.getByText(/wants to join/i).first().waitFor({ state: 'visible' });
  }

  async expectJoinQueueUserHidden(name: string) {
    await expect(this.page.getByText(name, { exact: false }).first()).toBeHidden({ timeout: 15_000 });
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

  async expectPrivateBadge() {
    await this.page
      .locator('[class*="badge"], span, div')
      .filter({ hasText: /^private$/i })
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 });
  }

  async expectNoJoinCta() {
    await expect(this.page.getByRole('button', { name: /join the game|play in a game/i })).toHaveCount(0);
  }

  async openShareModal() {
    await this.page.getByRole('button', { name: /share game/i }).click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  }

  async expectShareModalWithLink(gameId: string) {
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input, textarea').first()).toHaveValue(new RegExp(gameId));
  }

  async toggleParticipantsViewMode() {
    await this.page.getByTitle(/list view|carousel view/i).click();
  }

  async expectParticipantsListLayout() {
    await this.page.locator('.grid').filter({ has: this.page.locator('[class*="PlayerAvatar"]') }).first().waitFor({
      state: 'visible',
      timeout: 10_000,
    });
  }

  async openEditGameInfo(tab: EditGameInfoTab = 'general') {
    await this.page.getByRole('button', { name: /^edit$/i }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    if (tab !== 'general') {
      const labels: Record<EditGameInfoTab, RegExp> = {
        general: /^general$/i,
        when: /^when$/i,
        where: /^where$/i,
        price: /^price$/i,
      };
      await dialog.getByRole('button', { name: labels[tab] }).click();
    }
  }

  async fillGameName(name: string) {
    const dialog = this.page.getByRole('dialog');
    await dialog.locator('input[type="text"]').first().fill(name);
  }

  async saveEditGameInfo() {
    const saveResponse = this.page.waitForResponse(
      (res) => res.url().includes('/api/games/') && res.request().method() === 'PUT',
      { timeout: 20_000 },
    );
    await this.page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
    await saveResponse;
    await this.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15_000 });
  }

  async expectGameNameVisible(name: string) {
    await this.page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
  }

  async expectEditTabVisible(tab: EditGameInfoTab) {
    const dialog = this.page.getByRole('dialog');
    if (tab === 'when') {
      await dialog.getByText(/select time|duration/i).first().waitFor({ state: 'visible', timeout: 10_000 });
      return;
    }
    if (tab === 'where') {
      await dialog.getByText(/club|court/i).first().waitFor({ state: 'visible', timeout: 10_000 });
      return;
    }
    if (tab === 'price') {
      await dialog.getByText(/price type|per person|free/i).first().waitFor({ state: 'visible', timeout: 10_000 });
      return;
    }
    await dialog.locator('input[type="text"]').first().waitFor({ state: 'visible' });
  }

  async setPriceTypeFree() {
    const dialog = this.page.getByRole('dialog');
    await dialog.locator('select, [role="combobox"]').first().click().catch(() => undefined);
    const free = dialog.getByText(/^free$/i).first();
    if (await free.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await free.click();
      return;
    }
    await dialog.locator('button, [role="option"]').filter({ hasText: /^free$/i }).first().click();
  }

  async clickStartResultsEntry() {
    const startResponse = this.page.waitForResponse(
      (res) => res.url().includes('/start-results-entry') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await this.page.getByRole('button', { name: /start results entry/i }).click();
    const announced = this.page.getByRole('dialog').getByRole('button', { name: /confirm|continue|yes/i });
    if (await announced.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await announced.click();
    }
    await startResponse;
  }

  async enterFirstSetScore(teamAScore: number, teamBScore: number) {
    const scoreCell = this.page.locator('button.relative.group').filter({ hasText: /^0$/ }).first();
    await scoreCell.waitFor({ state: 'visible', timeout: 20_000 });
    await scoreCell.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const incButtons = dialog.locator('button').filter({ has: this.page.locator('svg') });
    const teamAUp = incButtons.nth(0);
    const teamBUp = incButtons.nth(3);
    for (let i = 0; i < teamAScore; i++) await teamAUp.click();
    for (let i = 0; i < teamBScore; i++) await teamBUp.click();
    const saveResponse = this.page.waitForResponse(
      (res) => res.url().includes('/matches/') && res.request().method() === 'PUT',
      { timeout: 20_000 },
    );
    await dialog.getByRole('button', { name: /^save$/i }).click();
    await saveResponse;
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  async expectSetScoreVisible(teamAScore: number, teamBScore: number) {
    await this.page.getByText(String(teamAScore), { exact: true }).first().waitFor({ state: 'visible' });
    await this.page.getByText(String(teamBScore), { exact: true }).first().waitFor({ state: 'visible' });
  }

  async openLiveScoringFromResults(gameId: string) {
    await this.page.getByRole('link', { name: /^play$/i }).click();
    await this.page.waitForURL(new RegExp(`/games/${gameId}/live`), { timeout: 15_000 });
  }

  async clickLeagueTab(tab: LeagueSeasonTab) {
    const labels: Record<LeagueSeasonTab, RegExp> = {
      general: /^general$/i,
      schedule: /^schedule$/i,
      planner: /^planner$/i,
      standings: /^standings$/i,
      faq: /^faq$/i,
    };
    await this.page.getByRole('button', { name: labels[tab] }).click();
  }

  async expectLeagueTabsVisible() {
    for (const label of [/^general$/i, /^schedule$/i, /^standings$/i]) {
      await this.page.getByRole('button', { name: label }).waitFor({ state: 'visible', timeout: 10_000 });
    }
  }

  async expectScheduleTabLoaded() {
    await this.page.getByText(/round|schedule|fixture|no rounds|create round/i).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }

  async expectStandingsTabLoaded() {
    await this.page.getByText(/standing|points|player|team/i).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }

  async clickInvitePlayer() {
    await this.page.getByRole('button', { name: /invite player/i }).first().click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 15_000 });
  }

  async invitePlayerByName(name: string) {
    const dialog = this.page.getByRole('dialog');
    const search = dialog.getByPlaceholder(/search/i);
    if (await search.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await search.fill(name.split(' ')[0] ?? name);
    }
    await dialog.getByText(name, { exact: false }).first().click();
    const inviteResponse = this.page.waitForResponse(
      (res) => res.url().includes('/invites') && res.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await dialog.getByRole('button', { name: /^confirm$/i }).click();
    await inviteResponse;
    await dialog.getByRole('button', { name: /^close$/i }).click().catch(() => dialog.press('Escape'));
  }

  async expandPendingInvites() {
    await this.page.getByText(/pending invites/i).click();
  }

  async cancelFirstPendingInvite() {
    const row = this.page.locator('.space-y-2').filter({ hasText: /invite sent/i }).first();
    await row.locator('button').last().click();
  }

  async declinePendingInvite(note?: string) {
    await this.page.getByRole('button', { name: /^decline$/i }).click();
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

  async expectPendingInvitesCount(count: number) {
    await expect(this.page.getByText(new RegExp(`pending invites.*\\(${count}\\)`, 'i'))).toBeVisible({
      timeout: 15_000,
    });
  }
}
