import { test, expect } from '@playwright/test';

test.describe('guest', () => {
  test('redirects unauthenticated user from home to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login page shows phone sign-in entry', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /bandeja/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /legacy phone sign-in|sign in with phone|phone sign-in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /login with telegram/i })).toBeVisible();
  });
});
