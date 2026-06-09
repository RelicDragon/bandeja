import type { Page } from '@playwright/test';

export class ShellPage {
  constructor(private readonly page: Page) {}

  async expectAuthenticatedHome() {
    await this.page.goto('/');
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
    await this.page.getByRole('button', { name: /^chats$/i }).waitFor({ state: 'visible', timeout: 20_000 });
  }

  async gotoTab(path: '/' | '/find' | '/chats' | '/marketplace' | '/leaderboard') {
    await this.page.goto(path);
    await expectUrlPath(this.page, path);
  }
}

async function expectUrlPath(page: Page, path: string) {
  await page.waitForURL((url) => url.pathname === path || url.pathname === `${path}/`, { timeout: 15_000 });
}
