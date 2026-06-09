import type { Page } from '@playwright/test';

type CreateEntityType = 'GAME' | 'BAR' | 'TRAINING' | 'TOURNAMENT';

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
    await this.page.locator('h1').filter({ hasText: /create game/i }).waitFor({ state: 'visible', timeout: 15_000 });
  }

  async gotoInvalidRoute() {
    await this.page.goto('/create-game');
  }

  async expectRedirectedHome() {
    await this.page.waitForURL((url) => url.pathname === '/' || url.pathname === '', { timeout: 15_000 });
  }

  async expectWizardLoaded() {
    await this.page.locator('h1').filter({ hasText: /create game/i }).waitFor({ state: 'visible' });
    await this.page.getByRole('button', { name: /^create game$/i }).waitFor({ state: 'visible' });
  }

  async expectBottomTabsHidden() {
    await this.page.getByRole('button', { name: /^chats$/i }).waitFor({ state: 'hidden', timeout: 5_000 });
    await this.page.getByRole('button', { name: /^market$/i }).waitFor({ state: 'hidden', timeout: 5_000 });
  }

  async clickBack() {
    await this.page.locator('.h-16').locator('button').first().click();
  }

  async selectFirstClub() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/clubs/city') && res.ok(),
      { timeout: 20_000 },
    ).catch(() => undefined);
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

  async selectFirstAvailableTimeSlot() {
    const showPast = this.page.getByText(/show past times/i);
    const toggle = showPast.locator('..').locator('button, [role="switch"]').last();
    if (await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await toggle.click();
    }
    const timeGrid = this.page.locator('label').filter({ hasText: /select time/i }).locator('..').locator('button:not([disabled])');
    await timeGrid.first().waitFor({ state: 'visible', timeout: 15_000 });
    await timeGrid.first().click();
  }

  async submitCreate() {
    const createResponse = this.page.waitForResponse(
      (res) => res.url().includes('/api/games') && res.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await this.page.getByRole('button', { name: /^create game$/i }).click();
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
}
