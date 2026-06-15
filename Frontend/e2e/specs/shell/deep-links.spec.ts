import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { HomePage } from '../../pages/home.page';

test.describe('shell deep links', () => {
  test('G-21 legacy home URL tab=list redirects to calendar @auth', async ({ page }) => {
    await page.goto('/?tab=list');
    await expect(page).toHaveURL(/\/?(\?|$)/);
    await new HomePage(page).waitForShell();
  });

  test('G-21 home URL subtab past-games @auth', async ({ page }) => {
    await page.goto('/?tab=past-games');
    await expect(page).toHaveURL(/tab=past-games/);
    const home = new HomePage(page);
    await home.waitForShell();
    await expect(home.subtab('past-games')).toHaveAttribute('aria-selected', 'true');
  });

  test('G-21 home URL subtab advanced @auth', async ({ page }) => {
    await page.goto('/?tab=advanced');
    await expect(page).toHaveURL(/tab=advanced/);
    const home = new HomePage(page);
    await home.waitForShell();
    await expect(home.subtab('advanced')).toHaveAttribute('aria-selected', 'true');
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
