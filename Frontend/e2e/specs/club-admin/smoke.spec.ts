import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { listClubAdminClubsViaApi } from '../../fixtures/user-teams.fixture';
import { ShellPage } from '../../pages/shell.page';
import { ClubAdminPage } from '../../pages/club-admin.page';

test.describe('club admin smoke @auth', () => {
  test('CA-01 My clubs entry navigates to club list', async ({ page }) => {
    const { token } = await e2eLogin();
    const clubs = await listClubAdminClubsViaApi(token);
    test.skip(clubs.length === 0, 'E2E user has no club admin clubs');

    await new ShellPage(page).expectAuthenticatedHome();
    const admin = new ClubAdminPage(page);
    await admin.myClubsFab().click();
    await expect(page).toHaveURL(/\/my-clubs/, { timeout: 15_000 });
  });

  test('CA-02 Club home dashboard loads', async ({ page }) => {
    const { token } = await e2eLogin();
    const clubs = await listClubAdminClubsViaApi(token);
    test.skip(clubs.length === 0, 'E2E user has no club admin clubs');

    const admin = new ClubAdminPage(page);
    await admin.gotoClubHome(clubs[0].id);
    await expect(page.getByText(clubs[0].name, { exact: false })).toBeVisible({ timeout: 20_000 });
  });

  test('CA-07 Reservations page loads', async ({ page }) => {
    const { token } = await e2eLogin();
    const clubs = await listClubAdminClubsViaApi(token);
    test.skip(clubs.length === 0, 'E2E user has no club admin clubs');

    await page.goto(`/my-clubs/${clubs[0].id}/reservations`);
    await expect(page).toHaveURL(/\/reservations/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/403|forbidden/i);
  });
});
