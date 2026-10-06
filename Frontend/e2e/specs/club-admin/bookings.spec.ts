import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { pickConsoleClub, signInPage } from '../../fixtures/club-admin.fixture';
import { ClubAdminPage } from '../../pages/club-admin.page';

/** Bookings filters live in the URL (UI_TEST_PLAN CA-40, CA-41). */
test.describe('club admin bookings @auth', () => {
  // Cold dev server + console data on a shared dev backend: allow a slow first paint.
  test.describe.configure({ timeout: 120_000 });

  test('CA-41 scope and type filters', async ({ page }) => {
    const session = await e2eLogin();
    const { token } = session;
    const club = await pickConsoleClub(token);
    test.skip(!club, 'E2E user operates no club with courts');
    await signInPage(page, session);

    const admin = new ClubAdminPage(page);
    await admin.gotoClub(club!.id, 'bookings');
    await expect(admin.kindChip('Blocks')).toBeVisible({ timeout: 45_000 });

    await admin.kindChip('Blocks').click();
    await expect(admin.kindChip('Blocks')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/kinds=hold/);

    await admin.bookingsScope('Past').click();
    await expect(page).toHaveURL(/scope=past/);
    await expect(admin.bookingsScope('Past')).toHaveAttribute('aria-checked', 'true');

    // Either rows grouped by day or the filtered empty state — never an error.
    await expect(page.getByText(/couldn't load|something went wrong/i)).toHaveCount(0);
  });
});
