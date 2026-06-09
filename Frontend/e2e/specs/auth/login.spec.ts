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

  test('A-05 register link', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.goToRegister();
    await new RegisterPage(page).expectLoaded();
  });
});
