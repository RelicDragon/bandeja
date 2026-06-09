import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('authenticated navigation', () => {
  test('home shows bottom nav for inactive tabs @auth', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await expect(page.getByRole('button', { name: /^chats$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^market$/i })).toBeVisible();
  });

  test('can open Find tab @auth', async ({ page }) => {
    await new ShellPage(page).gotoTab('/find');
  });

  test('can navigate to Chats tab @auth', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await page.getByRole('button', { name: /^chats$/i }).click();
    await expect(page).toHaveURL(/\/chats/);
  });

  test('can navigate to Marketplace tab @auth', async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
    await page.getByRole('button', { name: /^market$/i }).click();
    await expect(page).toHaveURL(/\/marketplace/);
  });
});
