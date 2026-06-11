import type { Page } from '@playwright/test';
import { e2eGetProfile, type E2eUser } from './api-client';

export async function seedAuthInBrowser(
  page: Page,
  token: string,
  user: E2eUser & Record<string, unknown>,
): Promise<void> {
  let authUser: E2eUser & Record<string, unknown> = user;
  try {
    const profile = await e2eGetProfile(token);
    authUser = { ...profile, ...user };
  } catch {
    // keep seeded overrides when profile fetch is unavailable
  }

  await page.goto('/login');
  await page.evaluate(
    ({ authToken, authUser: seededUser }) => {
      localStorage.setItem('token', authToken);
      localStorage.setItem('user', JSON.stringify(seededUser));
    },
    { authToken: token, authUser },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
}

export async function clearAuthInBrowser(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}
