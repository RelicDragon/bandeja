import { expect, type Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/register');
  }

  async expectLoaded() {
    await expect(this.page.getByRole('heading', { name: /^register$/i })).toBeVisible();
    await expect(this.page).toHaveURL(/\/register/);
  }

  firstNameInput() {
    return this.page.getByLabel(/^first name$/i);
  }

  lastNameInput() {
    return this.page.getByLabel(/^last name$/i);
  }

  phoneInput() {
    return this.page.getByPlaceholder('+1234567890');
  }

  passwordInput() {
    return this.page.locator('input[type="password"]').first();
  }

  passwordConfirmInput() {
    return this.page.locator('input[type="password"]').nth(1);
  }

  emailInput() {
    return this.page.getByLabel(/^email$/i);
  }

  eulaCheckbox() {
    return this.page.locator('#eula-checkbox');
  }

  genderAckCheckbox() {
    return this.page.locator('#gender-ack-checkbox');
  }

  submitButton() {
    return this.page.getByRole('button', { name: /^register$/i });
  }

  private async openDropdownNearLabel(label: RegExp) {
    const field = this.page.locator('div').filter({ has: this.page.getByText(label) }).getByRole('button').first();
    await field.click();
  }

  private async pickDropdownOption(name: RegExp) {
    const dropdown = this.page.locator('[data-select-dropdown]');
    await dropdown.waitFor({ state: 'visible', timeout: 5_000 });
    await dropdown.getByRole('button', { name }).click();
  }

  async selectGenderMale() {
    await this.openDropdownNearLabel(/^gender$/i);
    await this.pickDropdownOption(/^male$/i);
  }

  async selectPrimarySport(label: RegExp) {
    await this.openDropdownNearLabel(/main sport/i);
    await this.pickDropdownOption(label);
  }

  async fillRequiredFields(options: {
    phone: string;
    password: string;
    firstName?: string;
    lastName?: string;
    acceptEula?: boolean;
  }) {
    await this.firstNameInput().fill(options.firstName ?? 'E2E');
    await this.lastNameInput().fill(options.lastName ?? 'Register');
    await this.phoneInput().fill(options.phone);
    await this.passwordInput().fill(options.password);
    await this.passwordConfirmInput().fill(options.password);
    await this.genderAckCheckbox().check();
    if (options.acceptEula !== false) {
      await this.eulaCheckbox().check();
    }
  }

  async submit() {
    await this.submitButton().click();
  }

  async expectValidationErrors() {
    await expect(
      this.page
        .locator('p.text-red-500, p.text-red-400')
        .or(this.page.getByText(/required|must|acknowledge/i))
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(this.page).toHaveURL(/\/register/);
  }
}
