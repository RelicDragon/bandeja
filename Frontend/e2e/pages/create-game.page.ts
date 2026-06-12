import { expect, type Page } from '@playwright/test';

type CreateEntityType = 'GAME' | 'BAR' | 'TRAINING' | 'TOURNAMENT';

const ENTITY_HEADING: Record<CreateEntityType, RegExp> = {
  GAME: /create game/i,
  BAR: /create bar event/i,
  TRAINING: /create training session/i,
  TOURNAMENT: /create tournament/i,
};

const SUBMIT_LABEL: Record<CreateEntityType, RegExp> = {
  GAME: /^create game$/i,
  BAR: /^create bar event$/i,
  TRAINING: /^create training session$/i,
  TOURNAMENT: /^create tournament$/i,
};

export class CreateGamePage {
  constructor(private readonly page: Page) {}

  async gotoWithEntityType(entityType: CreateEntityType = 'GAME') {
    await this.page.goto('/');
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
    await this.page.evaluate((type) => {
      window.history.pushState({ usr: { entityType: type }, key: `e2e-${Date.now()}` }, '', '/create-game');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, entityType);
    await this.page.waitForURL(/\/create-game/, { timeout: 15_000 });
    await this.page.locator('h1').filter({ hasText: ENTITY_HEADING[entityType] }).waitFor({ state: 'visible', timeout: 15_000 });
  }

  async gotoInvalidRoute() {
    await this.page.goto('/create-game');
  }

  async expectRedirectedHome() {
    await this.page.waitForURL((url) => url.pathname === '/' || url.pathname === '', { timeout: 15_000 });
  }

  async expectWizardLoaded(entityType: CreateEntityType = 'GAME') {
    await this.page.locator('h1').filter({ hasText: ENTITY_HEADING[entityType] }).waitFor({ state: 'visible' });
    await this.page.getByRole('button', { name: SUBMIT_LABEL[entityType] }).waitFor({ state: 'visible' });
  }

  async expectBottomTabsHidden() {
    await this.page.getByRole('button', { name: /^chats$/i }).waitFor({ state: 'hidden', timeout: 5_000 });
    await this.page.getByRole('button', { name: /^market$/i }).waitFor({ state: 'hidden', timeout: 5_000 });
  }

  async clickBack() {
    await this.page.locator('.h-16').locator('button').first().click();
  }

  submitButton(entityType: CreateEntityType = 'GAME') {
    return this.page.getByRole('button', { name: SUBMIT_LABEL[entityType] });
  }

  async selectFirstClub() {
    await this.page
      .waitForResponse((res) => res.url().includes('/clubs/city') && res.ok(), { timeout: 20_000 })
      .catch(() => undefined);
    await this.page.getByRole('button', { name: /select club/i }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('heading', { name: /select club/i }).waitFor({ state: 'visible' });
    const clubButton = dialog.locator('.space-y-2 button').first();
    await clubButton.waitFor({ state: 'visible', timeout: 15_000 });
    await clubButton.click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  async pickDefaultTemplateIfShown() {
    const template = this.page.locator('button').filter({ hasText: /social|match|club bo3|custom/i }).first();
    if (await template.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await template.click();
    }
  }

  async selectTemplateMatching(pattern: RegExp) {
    const template = this.page.locator('button').filter({ hasText: pattern }).first();
    await template.waitFor({ state: 'visible', timeout: 10_000 });
    await template.click();
  }

  async selectFirstAvailableTimeSlot() {
    const showPast = this.page.getByText(/show past times/i);
    const toggle = showPast.locator('..').locator('button, [role="switch"]').last();
    if (await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await toggle.click();
    }
    const timeGrid = this.page
      .locator('label')
      .filter({ hasText: /select time/i })
      .locator('..')
      .locator('button:not([disabled])');
    await timeGrid.first().waitFor({ state: 'visible', timeout: 15_000 });
    await timeGrid.first().click();
  }

  async selectCourtNotBooked() {
    const inline = this.page.getByRole('button', { name: /don't book court/i });
    if (await inline.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await inline.click();
      return;
    }
    await this.page.getByRole('button', { name: /select court|select hall|don't book court/i }).click();
    const dialog = this.page.getByRole('dialog');
    const notBooked = dialog.getByRole('button', { name: /don't book court/i });
    if (await notBooked.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await notBooked.click();
    } else {
      await dialog.getByRole('button').first().click();
    }
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }

  async fillGameName(name: string) {
    const input = this.page.getByPlaceholder(/name|title/i).or(this.page.locator('input').filter({ has: this.page.locator('xpath=..') }));
    const nameField = this.page.locator('input[type="text"]').filter({ hasText: '' }).first();
    const section = this.page.getByText(/^game name|^event name|^tournament name/i).locator('..').locator('input').first();
    if (await section.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await section.fill(name);
    } else if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameField.fill(name);
    } else {
      await input.first().fill(name);
    }
  }

  async fillComments(text: string) {
    const textarea = this.page.locator('textarea').first();
    await textarea.fill(text);
  }

  async toggleRatingGame(enabled: boolean) {
    const section = this.page.getByText(/rating game/i).locator('..').getByRole('switch');
    const checked = await section.getAttribute('aria-checked');
    if ((checked === 'true') !== enabled) {
      await section.click();
    }
  }

  async toggleAnyoneCanInvite(enabled: boolean) {
    const row = this.page.getByText(/anyone can invite/i).locator('..').getByRole('switch');
    const checked = await row.getAttribute('aria-checked');
    if ((checked === 'true') !== enabled) {
      await row.click();
    }
  }

  async openFormatWizard() {
    await this.page.getByRole('button', { name: /customize|format wizard|advanced/i }).first().click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  }

  async closeFormatWizard() {
    await this.page.getByRole('button', { name: /^close$|^cancel$|^done$|^save$/i }).first().click();
    await this.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }

  async openPlayerInviteModal() {
    await this.page.getByRole('button', { name: /invite|add player|select player/i }).first().click();
    await this.page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  }

  async submitCreate(entityType: CreateEntityType = 'GAME') {
    const createResponse = this.page.waitForResponse(
      (res) => res.url().includes('/api/games') && res.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await this.submitButton(entityType).click();
    const overlapProceed = this.page.getByRole('button', { name: /continue anyway/i });
    if (await overlapProceed.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await overlapProceed.click();
    }
    const skipCourt = this.page.getByRole('button', { name: /not yet/i });
    if (await skipCourt.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await skipCourt.click();
    }
    const response = await createResponse;
    if (!response.ok()) {
      throw new Error(`Create game failed ${response.status()}: ${await response.text()}`);
    }
    const body = (await response.json()) as { data?: { id?: string } };
    await this.page.waitForURL((url) => !url.pathname.includes('/create-game'), { timeout: 30_000 });
    return body.data?.id ?? '';
  }

  async submitExpectBlocked(entityType: CreateEntityType = 'GAME') {
    const before = this.page.url();
    await this.submitButton(entityType).click();
    await this.page.waitForTimeout(500);
    await expect(this.page).toHaveURL(before);
  }

  async expectTrainingSpecificFields() {
    await expect(this.page.getByText(/training settings|participants/i).first()).toBeVisible();
  }

  async expectBarSpecificFields() {
    await expect(this.page.getByText(/bar|hall/i).first()).toBeVisible();
  }

  async expectTournamentSpecificFields() {
    await expect(this.page.getByText(/tournament participants|tournament settings/i).first()).toBeVisible();
  }
}
