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
    if (options.acceptEula !== false) {
      await this.eulaCheckbox().check();
    }
  }

  async submit() {
    await this.submitButton().click();
  }

  async expectValidationErrors() {
    await expect(this.page.locator('p.text-red-500, p.text-red-400').first()).toBeVisible({ timeout: 10_000 });
    await expect(this.page).toHaveURL(/\/register/);
  }

  async selectPrimarySport(label: RegExp) {
    await this.page.locator('select, [role="combobox"]').first().click();
    await this.page.getByRole('option', { name: label }).click();
  }
}
