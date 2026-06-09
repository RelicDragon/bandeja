import { test, expect, devices } from '@playwright/test';
import { HomePage } from '../../pages/home.page';

test.use({ ...devices['Pixel 7'] });

test.describe('home stories @auth', () => {
  test('H-04 stories rail visible', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.storiesRail()).toBeVisible({ timeout: 15_000 });
  });

  test('H-21 open story viewer', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    const opened = await home.openStoryViewerIfAvailable();
    test.skip(!opened, 'no story bubbles in feed');
  });

  test('H-23 create story sheet opens', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await home.openStoryCreateSheet();
  });

  test('H-22 story navigation', async () => {
    test.skip(true, 'requires multi-segment story seed');
  });

  test('H-24 photo story publish', async () => {
    test.skip(true, 'requires file upload — manual-only');
  });

  test('H-25 video story publish', async () => {
    test.skip(true, 'requires video file upload — manual-only');
  });

  test('H-26 story engagement', async () => {
    test.skip(true, 'requires published story with engagement enabled');
  });

  test('H-27 report story comment', async () => {
    test.skip(true, 'requires story with comments');
  });
});
