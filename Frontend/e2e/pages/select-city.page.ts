import { expect, type Locator, type Page } from '@playwright/test';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class SelectCityPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/select-city');
  }

  async expectLoaded() {
    await expect(this.heading()).toBeVisible({ timeout: 20_000 });
  }

  heading() {
    return this.page.getByRole('heading', { name: /select.*city|choose.*city/i });
  }

  searchInput() {
    return this.page.getByPlaceholder(/search city or club/i);
  }

  nearMeButton() {
    return this.page.getByRole('button', { name: /where am i|near me/i });
  }

  mapToggleButton() {
    return this.page.getByRole('button', { name: /^map$/i });
  }

  listToggleButton() {
    return this.page.getByRole('button', { name: /^list$/i });
  }

  suggestedSection() {
    return this.page.getByRole('region', { name: /suggested/i }).or(this.page.getByLabel(/suggested/i));
  }

  confirmButton() {
    return this.page.getByRole('button', { name: /^confirm$/i });
  }

  useCityButton(cityName?: string) {
    if (cityName) {
      return this.page.getByRole('button', { name: new RegExp(`use\\s+${escapeRegExp(cityName)}`, 'i') });
    }
    return this.page.getByRole('button', { name: /^use\s+/i });
  }

  /** Cities/Clubs mode toggle must not exist (section headers during search are fine). */
  async expectNoCitiesClubsModeSwitch(scope?: Locator) {
    const root = scope ?? this.page;
    await expect(root.getByRole('button', { name: /^cities$/i })).toHaveCount(0);
    await expect(root.getByRole('button', { name: /^clubs$/i })).toHaveCount(0);
  }

  async mockIpLocation(latitude: number, longitude: number) {
    await this.page.unroute('**/api/app/location**').catch(() => undefined);
    await this.page.route('**/api/app/location**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ latitude, longitude }),
      });
    });
  }

  async mockIpLocationUnavailable() {
    await this.page.unroute('**/api/app/location**').catch(() => undefined);
    await this.page.route('**/api/app/location**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Location not available' }),
      });
    });
    await this.page.context().clearPermissions();
  }

  async waitForSearchReady() {
    await expect(this.page).toHaveURL(/\/select-city/);
    await expect(this.page.locator('form .animate-spin')).toHaveCount(0, { timeout: 30_000 });
    await expect(this.searchInput()).toBeEnabled({ timeout: 30_000 });
  }

  async pickCityByName(cityName: string, countryKey?: string) {
    await this.waitForSearchReady();
    const search = this.searchInput();

    if (countryKey) {
      await search.fill(countryKey);
      await this.page.getByRole('button').filter({ hasText: new RegExp(escapeRegExp(countryKey), 'i') }).first().click();
      await expect(search).toBeEnabled();
    }

    await search.fill(cityName);
    await this.page.getByRole('button', { name: new RegExp(escapeRegExp(cityName), 'i') }).first().click();

    const confirm = this.confirmButton();
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }

  async pickCityViaClubSearch(clubName: string) {
    await this.waitForSearchReady();
    const search = this.searchInput();
    const clubRow = this.page.getByRole('button', { name: new RegExp(escapeRegExp(clubName), 'i') }).first();

    await expect(async () => {
      await search.fill(clubName);
      await expect(clubRow).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });

    await clubRow.click();

    const confirm = this.confirmButton();
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }

  async pickFirstCity() {
    const cityBtn = this.page
      .locator('button[type="button"]')
      .filter({ hasNotText: /continue|confirm|back|near me|map|list/i })
      .first();
    await cityBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await cityBtn.click();
    await this.page.getByRole('button', { name: /continue|confirm|save|select/i }).click();
    await this.page.waitForURL((url) => !url.pathname.includes('/select-city'), { timeout: 30_000 });
  }
}

export class ChangeCityModalPage {
  constructor(private readonly page: Page) {}

  dialog() {
    return this.page.getByRole('dialog').filter({ hasText: /city|change city|select city/i });
  }

  async expectOpen() {
    await expect(this.dialog()).toBeVisible({ timeout: 10_000 });
  }

  searchInput() {
    return this.dialog().getByPlaceholder(/search city or club/i);
  }

  nearMeButton() {
    return this.dialog().getByRole('button', { name: /where am i|near me/i });
  }

  mapToggleButton() {
    return this.dialog().getByRole('button', { name: /^map$/i });
  }

  suggestedSection() {
    return this.dialog().getByRole('region', { name: /suggested/i }).or(this.dialog().getByLabel(/suggested/i));
  }

  async expectNoCitiesClubsModeSwitch() {
    await new SelectCityPage(this.page).expectNoCitiesClubsModeSwitch(this.dialog());
  }

  async waitForReady() {
    await this.expectOpen();
    await expect(this.searchInput()).toBeEnabled({ timeout: 30_000 });
  }

  async commitCityViaClubSearch(clubName: string) {
    await this.waitForReady();
    const search = this.searchInput();
    const clubRow = this.dialog()
      .getByRole('button', { name: new RegExp(escapeRegExp(clubName), 'i') })
      .first();

    await expect(async () => {
      await search.fill(clubName);
      await expect(clubRow).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });

    await clubRow.click();
    await expect(this.dialog()).toBeHidden({ timeout: 30_000 });
  }
}
