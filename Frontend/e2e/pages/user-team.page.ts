import type { Locator, Page } from '@playwright/test';

export class UserTeamPage {
  constructor(private readonly page: Page) {}

  async goto(teamId: string) {
    await this.page.goto(`/user-team/${teamId}`);
    await this.page.waitForURL(new RegExp(`/user-team/${teamId}`), { timeout: 20_000 });
  }

  async waitForLoaded() {
    await this.page.waitForResponse(
      (res) => res.url().includes('/user-teams/') && res.ok(),
      { timeout: 30_000 },
    ).catch(() => undefined);
    const spinner = this.page.locator('.animate-spin').first();
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined);
  }

  teamNameInput(): Locator {
    return this.page.getByLabel(/^team name$|^name$/i).first();
  }

  ownerAvatar(): Locator {
    return this.page.locator('[class*="PlayerAvatar"], img.rounded-full').first();
  }

  pageRoot(): Locator {
    return this.page.locator('.mx-auto.max-w-2xl').first();
  }
}
