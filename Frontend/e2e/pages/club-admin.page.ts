import type { Locator, Page } from '@playwright/test';

export class ClubAdminPage {
  constructor(private readonly page: Page) {}

  myClubsFab(): Locator {
    return this.page.getByRole('button', { name: /my clubs/i });
  }

  async gotoMyClubs() {
    await this.page.goto('/my-clubs');
    await this.page.waitForURL(/\/my-clubs\/?$/, { timeout: 20_000 });
  }

  async gotoClubHome(clubId: string) {
    await this.page.goto(`/my-clubs/${clubId}`);
    await this.page.waitForURL(new RegExp(`/my-clubs/${clubId}/?$`), { timeout: 20_000 });
  }

  clubListItems(): Locator {
    return this.page.locator('button').filter({ has: this.page.locator('[class*="ClubAvatar"], img') });
  }

  scheduleLink(): Locator {
    return this.page.getByRole('button', { name: /calendar|schedule|today/i }).first()
      .or(this.page.getByText(/today'?s schedule|calendar/i).first());
  }

  reservationsLink(): Locator {
    return this.page.getByRole('button', { name: /reservations/i }).first()
      .or(this.page.getByText(/reservations/i).first());
  }

  courtsLink(): Locator {
    return this.page.getByRole('button', { name: /courts/i }).first();
  }

  settingsLink(): Locator {
    return this.page.getByRole('button', { name: /settings/i }).first();
  }
}
