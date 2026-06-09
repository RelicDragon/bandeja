import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';

test.describe('shell deep links', () => {
  test('G-21 home URL subtab list @auth', async ({ page }) => {
    await page.goto('/?tab=list');
    await expect(page).toHaveURL(/tab=list/);
    await new ShellPage(page).expectHomeSubtab('list');
  });

  test('G-21 home URL subtab past-games @auth', async ({ page }) => {
    await page.goto('/?tab=past-games');
    await expect(page).toHaveURL(/tab=past-games/);
    await new ShellPage(page).expectHomeSubtab('past-games');
  });

  test('G-22 find URL view list @auth', async ({ page }) => {
    const shell = new ShellPage(page);
    await page.goto('/find?view=list');
    await shell.waitForShellReady();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator('[data-calendar="true"]')).toHaveCount(0);
  });

  test('G-23 chats filter channels URL @auth', async ({ page }) => {
    await page.goto('/chats?filter=channels');
    await expect(page).toHaveURL(/filter=channels/);
    await new ShellPage(page).expectChatsFilter('channels');
  });

  test('G-23 chats marketplace route @auth', async ({ page }) => {
    await page.goto('/chats/marketplace');
    await expect(page).toHaveURL(/\/chats\/marketplace/);
    await new ShellPage(page).expectChatsFilter('market');
  });

  test('G-23 bugs route @auth', async ({ page }) => {
    await page.goto('/bugs');
    await expect(page).toHaveURL(/\/bugs/);
    await new ShellPage(page).expectChatsFilter('bugs');
  });
});
