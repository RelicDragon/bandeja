import { expect, type Locator, type Page } from '@playwright/test';

export type ConsoleTab = 'Today' | 'Schedule' | 'Bookings' | 'Reports' | 'Club';

/** Club admin console (`/my-clubs/*`). Selectors use roles + accessible names (English UI). */
export class ClubAdminPage {
  constructor(private readonly page: Page) {}

  myClubsFab(): Locator {
    return this.page.getByRole('button', { name: /my clubs/i });
  }

  async gotoMyClubs() {
    await this.page.goto('/my-clubs');
    await this.page.waitForURL(/\/my-clubs(\/[^/]+)?\/?(\?.*)?$/, { timeout: 45_000 });
  }

  async gotoClub(clubId: string, sub = '', search = '') {
    await this.page.goto(`/my-clubs/${clubId}${sub ? `/${sub}` : ''}${search}`);
    await this.page.waitForURL(new RegExp(`/my-clubs/${clubId}`), { timeout: 45_000 });
  }

  /** Bottom tab bar (phone) or sidebar (desktop). */
  sections(): Locator {
    return this.page.getByRole('navigation', { name: /club console sections/i });
  }

  tab(name: ConsoleTab): Locator {
    return this.sections().getByRole('link', { name: new RegExp(`^${name}$`, 'i') });
  }

  async openTab(name: ConsoleTab) {
    await this.tab(name).first().click();
    await expect(this.tab(name).first()).toHaveAttribute('aria-current', 'page');
  }

  clubSwitcher(): Locator {
    return this.page.getByRole('button', { name: /switch club/i }).first();
  }

  heading(text: RegExp): Locator {
    return this.page.getByRole('heading', { name: text }).first();
  }

  // ---- schedule ----

  scheduleGrid(): Locator {
    return this.page.getByRole('region', { name: /schedule/i });
  }

  firstFreeCell(): Locator {
    return this.scheduleGrid().locator('button[aria-label$="free — block this time"]').first();
  }

  slotByLabel(text: string): Locator {
    return this.page.locator(`[data-slot-key][aria-label*="${text}"]`);
  }

  sheet(): Locator {
    return this.page.getByRole('dialog').last();
  }

  async nextDay() {
    await this.page.getByRole('button', { name: /^next day$/i }).click();
  }

  // ---- bookings ----

  bookingsScope(name: 'Upcoming' | 'Past'): Locator {
    return this.page.getByRole('radio', { name });
  }

  kindChip(name: 'Games' | 'Blocks' | 'Club system'): Locator {
    return this.page.getByRole('group', { name: /booking type/i }).getByRole('button', { name });
  }
}
