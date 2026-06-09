import { test, expect } from '@playwright/test';
import { getE2eUserIds } from '../../fixtures/api-client';
import { UserProfilePage } from '../../pages/user-profile.page';

test.describe('profile routes @auth', () => {
  test('PR-34 User profile page loads', async ({ page }) => {
    const { userAId } = await getE2eUserIds();
    const userProfile = new UserProfilePage(page);
    await userProfile.goto(userAId);
    await expect(userProfile.profileContent()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/user-profile/${userAId}`));
  });

  test.describe('guest overlay', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('PR-52 Public profile guest view', async ({ page }) => {
      const { userAId } = await getE2eUserIds();
      const userProfile = new UserProfilePage(page);
      await userProfile.goto(userAId);
      await expect(userProfile.guestPrompt()).toBeVisible({ timeout: 20_000 });
    });
  });
});

test.describe('profile routes sport query @auth', () => {
  test('PR-35 User profile sport query accepted', async ({ page }) => {
    const { userAId } = await getE2eUserIds();
    const userProfile = new UserProfilePage(page);
    await userProfile.goto(userAId, 'sport=PADEL');
    await expect(page).toHaveURL(/sport=PADEL/);
    await expect(userProfile.profileContent()).toBeVisible({ timeout: 20_000 });
  });
});
