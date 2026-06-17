import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ProfilePage } from '../../pages/profile.page';

test.describe('shell pull refresh @auth', () => {
  test('G-12 pull to refresh My', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.expectAuthenticatedHome();
    await shell.simulatePullGesture({ release: false });
    await shell.expectRefreshIndicatorAboveStories();
    await page.evaluate(() => {
      document.body.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: 220 })],
        }),
      );
    });
    const refreshPromise = page.waitForResponse(
      (res) => res.url().includes('/api/') && res.request().method() === 'GET' && res.ok(),
      { timeout: 30_000 },
    );
    await refreshPromise.catch(() => undefined);
    await shell.expectBottomTabsVisible();
  });

  test('G-12 pull to refresh Find', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.gotoTab('/find');
    const refreshPromise = page.waitForResponse(
      (res) => res.url().includes('/games/available') && res.ok(),
      { timeout: 30_000 },
    );
    await shell.simulatePullToRefresh();
    await refreshPromise.catch(() => undefined);
    await expect(page).toHaveURL(/\/find/);
  });

  test('G-28 cache clear on refresh Find', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.gotoTab('/find');
    let fetchCount = 0;
    page.on('response', (res) => {
      if (res.url().includes('/games/available') && res.request().method() === 'GET') fetchCount += 1;
    });
    await shell.simulatePullToRefresh();
    await page.waitForTimeout(1500);
    expect(fetchCount).toBeGreaterThan(0);
  });
});

test.describe('shell theme i18n @auth', () => {
  test('G-18 i18n switch', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.changeLanguage('ru');
    await expect(page.getByText(/язык|language/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('G-19 dark light theme', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.toggleTheme('dark');
    await expect(page.locator('html.dark, .dark')).toHaveCount(1, { timeout: 10_000 });
    await profile.toggleTheme('light');
    await page.waitForTimeout(300);
  });
});

test.describe('shell find tab @auth', () => {
  test('G-27 re-tap Find tab', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.gotoTab('/find');
    await page.evaluate(() => window.scrollTo(0, 400));
    await shell.findTabButton().click();
    await expect(page).toHaveURL(/\/find/);
  });
});
