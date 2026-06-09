import type { Page } from '@playwright/test';
import type { E2eUser } from './api-client';

export async function seedAuthInBrowser(
  page: Page,
  token: string,
  user: E2eUser & Record<string, unknown>,
): Promise<void> {
  await page.goto('/login');
  await page.evaluate(
    ({ authToken, authUser }) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(authUser));
    },
    { authToken: token, authUser: user },
  );
}

export async function clearAuthInBrowser(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}
