import { test, expect } from '@playwright/test';
import { ShellPage } from '../../pages/shell.page';
import { ProfilePage } from '../../pages/profile.page';
import { SessionsPage } from '../../pages/sessions.page';

test.describe('profile settings @auth', () => {
  test.beforeEach(async ({ page }) => {
    await new ShellPage(page).expectAuthenticatedHome();
  });

  test('PR-10 First name autosave shows saved indicator', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    const input = profile.firstNameInput();
    const original = await input.inputValue();
    const stamp = `[E2E] ${Date.now()}`;
    await input.fill(stamp);
    await expect(page.locator('.text-green-600, .text-green-400').first()).toBeVisible({ timeout: 15_000 });
    await input.fill(original);
  });

  test('PR-12 Verbal status char counter', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await expect(page.getByText(/\d+\/32/)).toBeVisible({ timeout: 15_000 });
  });

  test('PR-13 Bio char counter', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await expect(page.getByText(/\d+\/128/)).toBeVisible({ timeout: 15_000 });
  });

  test('PR-21 Language selector visible', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.appearanceHeading().scrollIntoViewIfNeeded();
    await expect(page.getByText(/^language$/i)).toBeVisible();
  });

  test('PR-22 Theme selector applies dark theme', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.appearanceHeading().scrollIntoViewIfNeeded();
    await profile.openSelectNearLabel(/^theme$/i, /^dark$/i);
    await expect(page.locator('html.dark, html[class*="dark"]')).toBeAttached({ timeout: 10_000 });
    await profile.openSelectNearLabel(/^theme$/i, /^light$/i);
  });

  test('PR-23 Online status toggle visible', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await page.getByText(/show my online status/i).scrollIntoViewIfNeeded();
    await expect(page.getByText(/show my online status/i)).toBeVisible();
  });

  test('PR-24 Notification settings modal opens', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    const controlBtn = profile.controlNotificationsButton();
    if ((await controlBtn.count()) === 0) {
      test.skip(true, 'no notification preferences seeded');
    }
    await controlBtn.scrollIntoViewIfNeeded();
    await controlBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
  });

  test('A-21 Sessions list shows current device', async ({ page }) => {
    const profile = new ProfilePage(page);
    await profile.gotoGeneralTab();
    await profile.manageDevicesButton().scrollIntoViewIfNeeded();
    await profile.manageDevicesButton().click();
    const sessions = new SessionsPage(page);
    await expect(sessions.pageTitle()).toBeVisible({ timeout: 15_000 });
    await expect(sessions.currentDeviceBadge()).toBeVisible({ timeout: 15_000 });
    await expect(sessions.sessionCards().first()).toBeVisible();
  });
});
