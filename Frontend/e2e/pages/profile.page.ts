import { expect, type Locator, type Page } from '@playwright/test';

export type ProfileTab = 'general' | 'statistics' | 'comparison' | 'followers' | 'reviews';

const PROFILE_TAB_INDEX: Record<ProfileTab, number> = {
  general: 0,
  statistics: 1,
  comparison: 2,
  followers: 3,
  reviews: 4,
};

export class ProfilePage {
  constructor(private readonly page: Page) {}

  profileTablist(): Locator {
    return this.page.locator('header').getByRole('tablist').first();
  }

  async goto() {
    await this.page.goto('/profile');
    await this.page.waitForURL(/\/profile\/?$/, { timeout: 30_000 });
    await this.page.getByRole('button', { name: /^logout$/i }).waitFor({ state: 'visible', timeout: 30_000 });
  }

  async gotoGeneralTab() {
    await this.goto();
    await this.switchTab('general');
  }

  async switchTab(tab: ProfileTab) {
    const tablist = this.profileTablist();
    await tablist.waitFor({ state: 'visible', timeout: 20_000 });
    const target = tablist.getByRole('tab').nth(PROFILE_TAB_INDEX[tab]);
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true');
  }

  personalInfoHeading(): Locator {
    return this.page.getByRole('heading', { name: /^personal info$/i });
  }

  firstNameInput(): Locator {
    return this.page.getByLabel(/^first name$/i);
  }

  lastNameInput(): Locator {
    return this.page.getByLabel(/^last name$/i);
  }

  bioTextarea(): Locator {
    return this.page.locator('textarea[maxlength="128"]');
  }

  avatarImage(): Locator {
    return this.page.locator('img[alt*="avatar" i], img.rounded-full').first();
  }

  appearanceHeading(): Locator {
    return this.page.getByRole('heading', { name: /^appearance$/i });
  }

  themeField(): Locator {
    return this.page.getByText(/^theme$/i).locator('..').locator('[role="button"], button').first();
  }

  languageField(): Locator {
    return this.page.getByText(/^language$/i).locator('..').locator('[role="button"], button').first();
  }

  showOnlineStatusToggle(): Locator {
    return this.page.getByText(/^show online status$/i).locator('..').locator('button[role="switch"], input[type="checkbox"]').first()
      .or(this.page.locator('label').filter({ hasText: /^show online status$/i }).locator('..').locator('button').last());
  }

  controlNotificationsButton(): Locator {
    return this.page.getByRole('button', { name: /control notifications/i });
  }

  manageDevicesButton(): Locator {
    return this.page.getByRole('button', { name: /manage devices/i });
  }

  changeCityButton(): Locator {
    return this.page.getByRole('button', { name: /change city/i });
  }

  async openSelectNearLabel(label: RegExp, optionLabel: RegExp) {
    const field = this.page.getByText(label).locator('..').locator('button').first();
    await field.click();
    await this.page.getByRole('button', { name: optionLabel }).last().click();
  }

  async logout() {
    const logoutButton = this.page.getByRole('button', { name: /^logout$/i });
    await logoutButton.scrollIntoViewIfNeeded();
    await logoutButton.click();
    await this.page.waitForURL(/\/login/, { timeout: 20_000 });
  }

  async expectSessionCleared() {
    await expect(this.page).toHaveURL(/\/login/);
    const token = await this.page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  }

  async gotoGeneralTab() {
    await this.goto();
  }

  personalInfoHeading() {
    return this.page.getByRole('heading', { name: /personal info|profile settings|general/i });
  }

  firstNameInput() {
    return this.page.getByLabel(/^first name$/i);
  }

  avatarImage() {
    return this.page.locator('img.rounded-full').first();
  }

  languageSelect() {
    return this.page.getByLabel(/language/i);
  }

  themeSelect() {
    return this.page.locator('select').filter({ has: this.page.locator('option') }).last();
  }

  appearanceSection() {
    return this.page.getByText(/^appearance$/i);
  }

  async changeLanguage(code: 'ru' | 'es') {
    await this.appearanceSection().scrollIntoViewIfNeeded();
    const select = this.page.locator('select').filter({ hasText: /english|russian|spanish/i }).first();
    await select.selectOption(code);
  }

  async toggleTheme(mode: 'dark' | 'light') {
    await this.appearanceSection().scrollIntoViewIfNeeded();
    const select = this.page.locator('select').filter({ hasText: /dark|light|system/i }).first();
    await select.selectOption(mode);
  }
}
