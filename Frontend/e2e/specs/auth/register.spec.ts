import { test, expect } from '@playwright/test';
import { RegisterPage } from '../../pages/register.page';
import { ShellPage } from '../../pages/shell.page';
import { generateE2ePhone } from '../../fixtures/persona.fixture';

test.describe('auth register', () => {
  test('A-10 full registration', async ({ page }) => {
    const phone = generateE2ePhone();
    const password = 'E2eTest1!';
    const register = new RegisterPage(page);
    await register.goto();
    await register.fillRequiredFields({ phone, password });
    await register.submit();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '', { timeout: 30_000 });
    await new ShellPage(page).waitForShellReady();
  });

  test('A-11 validation errors', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.submit();
    await register.expectValidationErrors();
  });

  test('A-12 password mismatch', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.firstNameInput().fill('E2E');
    await register.lastNameInput().fill('Mismatch');
    await register.phoneInput().fill(generateE2ePhone());
    await register.passwordInput().fill('E2eTest1!');
    await register.passwordConfirmInput().fill('Different1!');
    await register.eulaCheckbox().check();
    await register.submit();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('A-13 phone format', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.firstNameInput().fill('E2E');
    await register.lastNameInput().fill('Phone');
    await register.phoneInput().fill('79001234567');
    await register.passwordInput().fill('E2eTest1!');
    await register.passwordConfirmInput().fill('E2eTest1!');
    await register.eulaCheckbox().check();
    await register.submit();
    await expect(page.getByText(/must start with \+/i)).toBeVisible();
  });

  test('A-14 gender prefer-not-to-say blocked', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.firstNameInput().fill('E2E');
    await register.lastNameInput().fill('Gender');
    await register.phoneInput().fill(generateE2ePhone());
    await register.passwordInput().fill('E2eTest1!');
    await register.passwordConfirmInput().fill('E2eTest1!');
    await register.eulaCheckbox().check();
    await register.submit();
    await expect(page.getByText(/acknowledge the gender preference/i)).toBeVisible();
  });

  test('A-15 primary sport selection', async ({ page }) => {
    const phone = generateE2ePhone();
    const register = new RegisterPage(page);
    await register.goto();
    await register.fillRequiredFields({ phone, password: 'E2eTest1!' });
    await register.selectPrimarySport(/^tennis$/i);
    await register.submit();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '', { timeout: 30_000 });
    await new ShellPage(page).waitForShellReady();
  });

  test('A-16 optional email invalid', async ({ page }) => {
    const register = new RegisterPage(page);
    await register.goto();
    await register.firstNameInput().fill('E2E');
    await register.lastNameInput().fill('Email');
    await register.phoneInput().fill(generateE2ePhone());
    await register.passwordInput().fill('E2eTest1!');
    await register.passwordConfirmInput().fill('E2eTest1!');
    await register.emailInput().fill('not-an-email');
    await register.eulaCheckbox().check();
    await register.submit();
    await expect(page.getByText(/invalid email/i)).toBeVisible();
  });
});
