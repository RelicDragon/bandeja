import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { RegisterPage } from '../../pages/register.page';
import { getE2eCredentials } from '../../test-user';

const { phone } = getE2eCredentials();

test.describe('auth login', () => {
  test('A-02 invalid credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginWithInvalidCredentials(phone, 'wrong-password-e2e');
  });

  test('A-03 already authenticated redirects from login @auth', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL((url) => url.pathname === '/' || url.pathname === '');
  });

  test('A-04 phone tab navigation', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.expectMainTabVisible();
    await login.openPhoneSignIn();
    await login.expectPhoneFormVisible();
    await page.getByRole('button', { name: /^back$/i }).click();
    await login.expectMainTabVisible();
  });

  test('A-06 Telegram login shows OTP fallback', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
    const login = new LoginPage(page);
    await login.goto();

    await page.getByRole('button', { name: /login with telegram/i }).click();

    const firstDigit = page.getByLabel(/one-time code digit 1/i);
    const submitButton = page.getByRole('button', { name: /use code/i });
    await expect(page.getByText(/if the link does not bring you back/i)).toBeVisible();
    await expect(firstDigit).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeHidden();
    await expect(page.getByRole('button', { name: /legacy phone sign-in/i })).toBeHidden();
    await expect(submitButton).toBeDisabled();

    for (const [index, digit] of Array.from('123456').entries()) {
      await page.getByLabel(new RegExp(`one-time code digit ${index + 1}`, 'i')).fill(digit);
    }

    await expect(page.getByLabel(/one-time code digit 6/i)).toHaveValue('6');
    await expect(submitButton).toBeEnabled();

    await page.getByRole('button', { name: /^back$/i }).click();
    await login.expectMainTabVisible();
  });

  test('A-05 register link', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.goToRegister();
    await new RegisterPage(page).expectLoaded();
  });

  test('A-09 EULA link', async ({ page, context }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.openPhoneSignIn();
    const popupPromise = context.waitForEvent('page');
    await page.getByRole('link', { name: /terms of service|eula/i }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/eula\.html/);
    await popup.close();
  });
});
