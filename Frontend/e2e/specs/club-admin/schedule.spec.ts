import { test, expect } from '@playwright/test';
import { e2eLogin } from '../../fixtures/api-client';
import { addDays, deleteHoldsWithNote, pickConsoleClub, signInPage } from '../../fixtures/club-admin.fixture';
import { ClubAdminPage } from '../../pages/club-admin.page';

/** Schedule block → remove (UI_TEST_PLAN CA-24, CA-28, CA-30). Works on club-local tomorrow. */
test.describe('club admin schedule @auth', () => {
  // Cold dev server + console data on a shared dev backend: allow a slow first paint.
  test.describe.configure({ timeout: 120_000 });

  test('CA-24 block a free slot, then remove it', async ({ page }) => {
    const session = await e2eLogin();
    const { token } = session;
    const club = await pickConsoleClub(token);
    test.skip(!club, 'E2E user operates no club with courts');
    await signInPage(page, session);
    const date = addDays(club!.today, 1);
    const marker = `e2e-${Date.now()}`;

    const admin = new ClubAdminPage(page);
    try {
      await admin.gotoClub(club!.id, 'schedule', `?date=${date}`);
      const cell = admin.firstFreeCell();
      await expect(cell).toBeVisible({ timeout: 45_000 });
      await cell.click();

      const sheet = admin.sheet();
      await expect(sheet.getByText(/block a court/i).first()).toBeVisible();
      await sheet.getByLabel(/^note$/i).fill(marker);
      await sheet.getByRole('button', { name: /^block court$/i }).click();
      await expect(sheet).toBeHidden({ timeout: 15_000 });

      const block = admin.slotByLabel(marker);
      await expect(block).toBeVisible({ timeout: 15_000 });
      await expect(block).toHaveAttribute('aria-label', /Blocked/);

      await block.click();
      const detail = admin.sheet();
      await detail.getByRole('button', { name: /remove block/i }).click();
      await detail.getByRole('button', { name: /^(delete|only this one)$/i }).click();
      await expect(admin.slotByLabel(marker)).toHaveCount(0, { timeout: 15_000 });
    } finally {
      await deleteHoldsWithNote(token, club!.id, date, marker);
    }
  });
});
