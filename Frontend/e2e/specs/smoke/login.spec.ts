import { test } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { ShellPage } from '../../pages/shell.page';
import { getE2eCredentials } from '../../test-user';

const { phone, password } = getE2eCredentials();

test.describe('phone login', () => {
  test('A-01 phone login happy path', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.loginWithPhone(phone, password);
    await new ShellPage(page).expectAuthenticatedHome();
  });
});
