import { test, expect } from '@playwright/test';
import { e2eGetProfile, e2eLogin } from '../../fixtures/api-client';
import { pickConsoleClub, signInPage } from '../../fixtures/club-admin.fixture';
import { ShellPage } from '../../pages/shell.page';
import { ClubAdminPage } from '../../pages/club-admin.page';

/**
 * Club admin console shell (UI_TEST_PLAN §17.1). Needs an e2e user who operates a club with
 * courts — the seeded users are platform admins, which qualifies; otherwise add a ClubAdmin row.
 */
test.describe('club admin console shell @auth', () => {
  // Cold dev server + console data on a shared dev backend: allow a slow first paint.
  test.describe.configure({ timeout: 120_000 });

  test('CA-01 My clubs entry opens the console', async ({ page }) => {
    const { token } = await e2eLogin();
    const me = (await e2eGetProfile(token)) as { clubAdminClubs?: unknown[] };
    // The FAB is for club team members (ClubAdmin rows); platform admins reach /my-clubs by URL.
    test.skip(!me.clubAdminClubs?.length, 'E2E user has no ClubAdmin membership (FAB hidden)');

    await new ShellPage(page).expectAuthenticatedHome();
    const admin = new ClubAdminPage(page);
    await admin.myClubsFab().click();
    await expect(page).toHaveURL(/\/my-clubs/, { timeout: 15_000 });
  });

  test('CA-04 tabs navigate and back pops history', async ({ page }) => {
    const session = await e2eLogin();
    const { token } = session;
    const club = await pickConsoleClub(token);
    test.skip(!club, 'E2E user operates no club with courts');
    await signInPage(page, session);

    const admin = new ClubAdminPage(page);
    await admin.gotoClub(club!.id);
    await expect(admin.clubSwitcher()).toBeVisible({ timeout: 45_000 });
    await expect(admin.tab('Today')).toHaveAttribute('aria-current', 'page');

    await admin.openTab('Schedule');
    await expect(page).toHaveURL(new RegExp(`/my-clubs/${club!.id}/schedule`));
    await expect(admin.scheduleGrid()).toBeVisible({ timeout: 45_000 });

    await admin.openTab('Bookings');
    await expect(page).toHaveURL(new RegExp(`/my-clubs/${club!.id}/bookings`));

    await admin.openTab('Club');
    await page.getByRole('link', { name: /^courts/i }).click();
    await expect(page).toHaveURL(/\/club\/courts$/);
    await page.getByRole('button', { name: /^back$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/my-clubs/${club!.id}/club$`));
  });

  test('CA-09 legacy reservations link redirects to bookings', async ({ page }) => {
    const session = await e2eLogin();
    const { token } = session;
    const club = await pickConsoleClub(token);
    test.skip(!club, 'E2E user operates no club with courts');
    await signInPage(page, session);

    await page.goto(`/my-clubs/${club!.id}/reservations`);
    await expect(page).toHaveURL(new RegExp(`/my-clubs/${club!.id}/bookings`), { timeout: 45_000 });
    await expect(page.locator('body')).not.toContainText(/403|forbidden/i);
  });
});
